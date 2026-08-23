import { getSingleTemplateVariableName } from "@flowweave/shared";
import { flowDocumentSchema, type FlowDocument, type NormalizedStep, type Target } from "./schema.js";

export type FlowPortabilityWarningCode =
  | "secret-default-removed"
  | "password-value-variableized"
  | "password-hint-removed"
  | "upload-path-variableized"
  | "url-userinfo-removed"
  | "url-query-variableized";

export type FlowPortabilityWarning = {
  code: FlowPortabilityWarningCode;
  path: string;
  message: string;
  variableName?: string;
};

export type PortableFlowDocumentResult = {
  document: FlowDocument;
  warnings: FlowPortabilityWarning[];
};

type FlowVariable = FlowDocument["variables"][number];

const secretVariablePattern = /^secret_/i;
const passwordTargetPattern = /password|passwd|passcode|pwd|密码|口令/i;
const absoluteWindowsPathPattern = /^[a-z]:[\\/]/i;
const urlWithAuthorityPattern = /^([a-z][a-z\d+.-]*:\/\/)([^/?#]*)(.*)$/i;
const sensitiveQueryKeys = new Set([
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "sessiontoken",
  "bearertoken",
  "apikey",
  "key",
  "secret",
  "clientsecret",
  "password",
  "passwd",
  "auth",
  "authorization",
]);

function normalizeVariableToken(value: string, fallback: string): string {
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return normalized || fallback;
}

function allocateVariableName(baseName: string, usedNames: Set<string>): string {
  if (!usedNames.has(baseName)) {
    usedNames.add(baseName);
    return baseName;
  }

  let suffix = 2;
  while (usedNames.has(`${baseName}_${suffix}`)) {
    suffix += 1;
  }
  const allocatedName = `${baseName}_${suffix}`;
  usedNames.add(allocatedName);
  return allocatedName;
}

function createRequiredStringVariable(name: string): FlowVariable {
  return {
    name,
    type: "string",
    required: true,
  };
}

function isPasswordTarget(target: Target): boolean {
  const hints = target.hints;
  if (hints?.inputType?.toLowerCase() === "password") {
    return true;
  }

  if (
    [hints?.nameAttr, hints?.placeholder, hints?.labelText].some(
      (value) => value !== undefined && passwordTargetPattern.test(value),
    )
  ) {
    return true;
  }

  return target.strategies.some((strategy) => {
    if (strategy.kind === "css") {
      return passwordTargetPattern.test(strategy.selector);
    }
    if (strategy.kind === "role") {
      return strategy.name !== undefined && passwordTargetPattern.test(strategy.name);
    }
    return false;
  });
}

function hintContainsLiteral(hint: string | undefined, literal: string): boolean {
  if (hint === undefined) {
    return false;
  }
  const normalizedHint = hint.trim();
  const normalizedLiteral = literal.trim();
  if (!normalizedLiteral) {
    return false;
  }
  return (
    normalizedHint === normalizedLiteral ||
    (normalizedLiteral.length >= 3 && normalizedHint.includes(normalizedLiteral))
  );
}

function sanitizePasswordTargetHints(
  target: Target,
  literal: string | undefined,
): { target: Target; removed: boolean } {
  if (!target.hints) {
    return { target, removed: false };
  }

  const hints = { ...target.hints };
  let removed = false;
  if (hints.textSample !== undefined) {
    delete hints.textSample;
    removed = true;
  }

  if (literal !== undefined) {
    const possiblyLeakingKeys = ["nameAttr", "placeholder", "labelText", "scopeText"] as const;
    for (const key of possiblyLeakingKeys) {
      if (hintContainsLiteral(hints[key], literal)) {
        delete hints[key];
        removed = true;
      }
    }
  }

  return removed
    ? {
        target: {
          ...target,
          hints,
        },
        removed: true,
      }
    : { target, removed: false };
}

function isAbsoluteLocalPath(value: string): boolean {
  return value.startsWith("/") || value.startsWith("\\\\") || absoluteWindowsPathPattern.test(value);
}

function decodeQueryKey(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

function normalizeQueryKey(value: string): string {
  return decodeQueryKey(value).trim().toLowerCase().replace(/[._-]/g, "");
}

function isSensitiveQueryKey(value: string): boolean {
  return sensitiveQueryKeys.has(normalizeQueryKey(value));
}

function stripUrlUserInfo(value: string): { url: string; removed: boolean } {
  const match = urlWithAuthorityPattern.exec(value);
  if (!match) {
    return { url: value, removed: false };
  }

  const scheme = match[1];
  const authority = match[2];
  const rest = match[3];
  if (scheme === undefined || authority === undefined || rest === undefined) {
    return { url: value, removed: false };
  }
  const userInfoEnd = authority.lastIndexOf("@");
  if (userInfoEnd < 0) {
    return { url: value, removed: false };
  }

  return {
    url: `${scheme}${authority.slice(userInfoEnd + 1)}${rest}`,
    removed: true,
  };
}

function sanitizeNavigateUrl(
  value: string,
  stepId: string,
  stepIndex: number,
  variables: FlowVariable[],
  usedVariableNames: Set<string>,
  warnings: FlowPortabilityWarning[],
): string {
  const withoutUserInfo = stripUrlUserInfo(value);
  if (withoutUserInfo.removed) {
    warnings.push({
      code: "url-userinfo-removed",
      path: `steps[${stepIndex}].url`,
      message: "已移除 URL 中的用户名或密码。",
    });
  }

  const hashStart = withoutUserInfo.url.indexOf("#");
  const beforeHash = hashStart >= 0 ? withoutUserInfo.url.slice(0, hashStart) : withoutUserInfo.url;
  const hash = hashStart >= 0 ? withoutUserInfo.url.slice(hashStart) : "";
  const queryStart = beforeHash.indexOf("?");
  if (queryStart < 0) {
    return withoutUserInfo.url;
  }

  const prefix = beforeHash.slice(0, queryStart + 1);
  const rawQuery = beforeHash.slice(queryStart + 1);
  const queryParts = rawQuery.split("&");
  let changed = false;

  const sanitizedParts = queryParts.map((part) => {
    const separatorIndex = part.indexOf("=");
    const rawKey = separatorIndex >= 0 ? part.slice(0, separatorIndex) : part;
    const rawValue = separatorIndex >= 0 ? part.slice(separatorIndex + 1) : "";
    if (!rawKey || !isSensitiveQueryKey(rawKey)) {
      return part;
    }

    const decodedValue = decodeQueryKey(rawValue);
    const existingVariableName = getSingleTemplateVariableName(decodedValue);
    if (existingVariableName) {
      return part;
    }

    const queryToken = normalizeVariableToken(decodeQueryKey(rawKey), "credential");
    const stepToken = normalizeVariableToken(stepId, `step_${stepIndex + 1}`);
    const variableName = allocateVariableName(
      `secret_url_${queryToken}_${stepToken}`,
      usedVariableNames,
    );
    variables.push(createRequiredStringVariable(variableName));
    warnings.push({
      code: "url-query-variableized",
      path: `steps[${stepIndex}].url.query.${decodeQueryKey(rawKey)}`,
      message: "已将 URL 中的明显敏感查询参数替换为必填变量。",
      variableName,
    });
    changed = true;
    return `${rawKey}={{${variableName}}}`;
  });

  if (!changed) {
    return withoutUserInfo.url;
  }
  return `${prefix}${sanitizedParts.join("&")}${hash}`;
}

function sanitizeStep(
  step: NormalizedStep,
  stepIndex: number,
  variables: FlowVariable[],
  usedVariableNames: Set<string>,
  warnings: FlowPortabilityWarning[],
): NormalizedStep {
  if (step.type === "fill" && isPasswordTarget(step.target)) {
    const existingVariableName = getSingleTemplateVariableName(step.value);
    const sanitizedTarget = sanitizePasswordTargetHints(
      step.target,
      existingVariableName ? undefined : step.value,
    );
    if (existingVariableName) {
      if (sanitizedTarget.removed) {
        warnings.push({
          code: "password-hint-removed",
          path: `steps[${stepIndex}].target.hints`,
          message: "已移除密码输入目标中可能包含 DOM 明文的提示样本。",
          variableName: existingVariableName,
        });
      }
      return sanitizedTarget.removed ? { ...step, target: sanitizedTarget.target } : step;
    }

    const stepToken = normalizeVariableToken(step.id, `step_${stepIndex + 1}`);
    const variableName = allocateVariableName(
      `secret_password_${stepToken}`,
      usedVariableNames,
    );
    variables.push(createRequiredStringVariable(variableName));
    warnings.push({
      code: "password-value-variableized",
      path: `steps[${stepIndex}].value`,
      message: "已将密码输入字面量替换为必填敏感变量。",
      variableName,
    });
    if (sanitizedTarget.removed) {
      warnings.push({
        code: "password-hint-removed",
        path: `steps[${stepIndex}].target.hints`,
        message: "已移除密码输入目标中可能泄露输入值的提示字段。",
        variableName,
      });
    }
    return {
      ...step,
      target: sanitizedTarget.target,
      value: `{{${variableName}}}`,
    };
  }

  if (step.type === "upload") {
    const files = step.files.map((file, fileIndex) => {
      if (getSingleTemplateVariableName(file) || !isAbsoluteLocalPath(file)) {
        return file;
      }

      const stepToken = normalizeVariableToken(step.id, `step_${stepIndex + 1}`);
      const variableName = allocateVariableName(
        `upload_file_${stepToken}_${fileIndex + 1}`,
        usedVariableNames,
      );
      variables.push(createRequiredStringVariable(variableName));
      warnings.push({
        code: "upload-path-variableized",
        path: `steps[${stepIndex}].files[${fileIndex}]`,
        message: "已将本机绝对上传路径替换为必填文件变量。",
        variableName,
      });
      return `{{${variableName}}}`;
    });
    return files.every((file, index) => file === step.files[index]) ? step : { ...step, files };
  }

  if (step.type === "navigate") {
    const url = sanitizeNavigateUrl(
      step.url,
      step.id,
      stepIndex,
      variables,
      usedVariableNames,
      warnings,
    );
    return url === step.url ? step : { ...step, url };
  }

  return step;
}

/**
 * 校验 FlowDocument，并生成可直接序列化的安全副本及实际处理 warnings。
 *
 * 该合同只处理 schemaVersion 1 中可识别的敏感字段，不承诺扫描任意业务文本。
 */
export function createPortableFlowDocument(input: unknown): PortableFlowDocumentResult {
  const source = flowDocumentSchema.parse(input) as FlowDocument;
  const warnings: FlowPortabilityWarning[] = [];
  const variables = source.variables.map((variable, variableIndex) => {
    if (!secretVariablePattern.test(variable.name) || variable.defaultValue === undefined) {
      return variable;
    }

    const { defaultValue: _removedDefaultValue, ...portableVariable } = variable;
    warnings.push({
      code: "secret-default-removed",
      path: `variables[${variableIndex}].defaultValue`,
      message: "已移除敏感变量默认值。",
      variableName: variable.name,
    });
    return portableVariable;
  });
  const usedVariableNames = new Set(variables.map((variable) => variable.name));
  const steps = source.steps.map((step, stepIndex) =>
    sanitizeStep(step, stepIndex, variables, usedVariableNames, warnings),
  );
  const document = flowDocumentSchema.parse({
    ...source,
    variables,
    steps,
  }) as FlowDocument;

  return { document, warnings };
}
