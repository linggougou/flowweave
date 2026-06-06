import { describe, expect, it } from "vitest";
import { FLOW_SCHEMA_VERSION, parseRecordedEvent } from "@flowweave/shared";
import type { RecordedEvent } from "@flowweave/shared";
import { flowDocumentSchema } from "@flowweave/flow-dsl";
import {
  buildFlowFromEvents,
  normalizeRecordedEvent,
  type BuildFlowFromEventsMeta,
} from "./normalize.js";

const baseMeta: BuildFlowFromEventsMeta = {
  sessionId: "sess_1",
  projectId: "proj_1",
  startedAt: "2026-05-25T10:00:00.000Z",
  flowId: "flow_rec_1",
  name: "录制流程",
};

function event(partial: Omit<RecordedEvent, "payload"> & { payload?: Record<string, unknown> }): RecordedEvent {
  return {
    id: partial.id,
    type: partial.type,
    timestamp: partial.timestamp,
    url: partial.url,
    frameId: partial.frameId,
    payload: partial.payload ?? {},
  };
}

describe("normalizeRecordedEvent", () => {
  it("将 click 事件转为带 Target 的 click 步骤", () => {
    const step = normalizeRecordedEvent(
      event({
        id: "evt_click",
        type: "click",
        timestamp: 1000,
        url: "https://example.com/app",
        payload: { role: "button", name: "提交" },
      }),
    );

    expect(step).toEqual({
      id: "evt_click",
      type: "click",
      target: {
        strategies: [{ kind: "role", role: "button", name: "提交" }],
      },
    });
  });

  it("click 支持 payload 中的 button", () => {
    const step = normalizeRecordedEvent(
      event({
        id: "evt_click_2",
        type: "click",
        timestamp: 1001,
        url: "https://example.com/app",
        payload: { selector: "#menu", button: "right" },
      }),
    );

    expect(step).toMatchObject({
      type: "click",
      button: "right",
      target: { strategies: [{ kind: "css", selector: "#menu" }] },
    });
  });

  it("将 fill 事件转为 fill 步骤", () => {
    const step = normalizeRecordedEvent(
      event({
        id: "evt_fill",
        type: "fill",
        timestamp: 2000,
        url: "https://example.com/login",
        payload: { selector: "#username", value: "demo_user", clear: true },
      }),
    );

    expect(step).toEqual({
      id: "evt_fill",
      type: "fill",
      target: {
        strategies: [{ kind: "css", selector: "#username" }],
      },
      value: "demo_user",
      clear: true,
    });
  });

  it("将 contenteditable 的 fill 事件转为 fill 步骤并保留 hints", () => {
    const step = normalizeRecordedEvent(
      event({
        id: "evt_fill_contenteditable",
        type: "fill",
        timestamp: 2050,
        url: "https://example.com/editor",
        payload: {
          selector: "#editor-body",
          role: "textbox",
          name: "交接备注",
          value: "需要补充库存说明",
          tagName: "div",
          textSample: "需要补充库存说明",
        },
      }),
    );

    expect(step).toEqual({
      id: "evt_fill_contenteditable",
      type: "fill",
      target: {
        strategies: [
          { kind: "role", role: "textbox", name: "交接备注" },
          { kind: "css", selector: "#editor-body" },
        ],
        hints: {
          tagName: "div",
          textSample: "需要补充库存说明",
        },
      },
      value: "需要补充库存说明",
    });
  });

  it("将 checkbox 语义归一化为 setChecked 步骤并保留 hints", () => {
    const step = normalizeRecordedEvent(
      event({
        id: "evt_toggle",
        type: "click",
        timestamp: 2100,
        url: "https://example.com/settings",
        payload: {
          role: "checkbox",
          name: "同意协议",
          selector: "#agree",
          inputType: "checkbox",
          checked: true,
          tagName: "input",
          nameAttr: "agree",
          labelText: "同意协议",
          textSample: "同意协议",
        },
      }),
    );

    expect(step).toEqual({
      id: "evt_toggle",
      type: "setChecked",
      target: {
        strategies: [
          { kind: "role", role: "checkbox", name: "同意协议" },
          { kind: "css", selector: "#agree" },
        ],
        hints: {
          tagName: "input",
          inputType: "checkbox",
          nameAttr: "agree",
          labelText: "同意协议",
          textSample: "同意协议",
        },
      },
      checked: true,
    });
  });

  it("将 radio 语义归一化为 setChecked 步骤", () => {
    const step = normalizeRecordedEvent(
      event({
        id: "evt_radio",
        type: "click",
        timestamp: 2150,
        url: "https://example.com/settings",
        payload: {
          role: "radio",
          name: "企业版",
          selector: "#plan-enterprise",
          inputType: "radio",
          checked: true,
          tagName: "input",
          nameAttr: "plan",
          labelText: "企业版",
          textSample: "企业版",
        },
      }),
    );

    expect(step).toEqual({
      id: "evt_radio",
      type: "setChecked",
      target: {
        strategies: [
          { kind: "role", role: "radio", name: "企业版" },
          { kind: "css", selector: "#plan-enterprise" },
        ],
        hints: {
          tagName: "input",
          inputType: "radio",
          nameAttr: "plan",
          labelText: "企业版",
          textSample: "企业版",
        },
      },
      checked: true,
    });
  });

  it("将 select 事件转为 select 步骤并保留 hints", () => {
    const step = normalizeRecordedEvent(
      event({
        id: "evt_select",
        type: "select",
        timestamp: 2200,
        url: "https://example.com/settings",
        payload: {
          role: "combobox",
          name: "所在城市",
          selector: "#city",
          values: ["shanghai"],
          tagName: "select",
          nameAttr: "city",
          labelText: "所在城市",
          textSample: "上海",
        },
      }),
    );

    expect(step).toEqual({
      id: "evt_select",
      type: "select",
      target: {
        strategies: [
          { kind: "role", role: "combobox", name: "所在城市" },
          { kind: "css", selector: "#city" },
        ],
        hints: {
          tagName: "select",
          nameAttr: "city",
          labelText: "所在城市",
          textSample: "上海",
        },
      },
      values: ["shanghai"],
    });
  });

  it("将 keypress 事件转为 press 步骤并保留目标", () => {
    const step = normalizeRecordedEvent(
      event({
        id: "evt_press",
        type: "keypress",
        timestamp: 2250,
        url: "https://example.com/search",
        payload: {
          selector: "#keyword",
          role: "textbox",
          name: "搜索词",
          key: "Enter",
          tagName: "input",
          inputType: "text",
          nameAttr: "keyword",
          labelText: "搜索词",
        },
      }),
    );

    expect(step).toEqual({
      id: "evt_press",
      type: "press",
      key: "Enter",
      target: {
        strategies: [
          { kind: "role", role: "textbox", name: "搜索词" },
          { kind: "css", selector: "#keyword" },
        ],
        hints: {
          tagName: "input",
          inputType: "text",
          nameAttr: "keyword",
          labelText: "搜索词",
        },
      },
    });
  });

  it("将 file input 事件中的占位回放输入转为 upload 步骤", () => {
    const step = normalizeRecordedEvent(
      parseRecordedEvent({
        id: "evt_upload",
        type: "fill",
        timestamp: 2300,
        url: "https://example.com/upload",
        payload: {
          selector: "#resume",
          inputType: "file",
          files: ["{{upload_resume_1}}"],
          fileNames: ["resume.pdf"],
          tagName: "input",
          nameAttr: "resume",
          labelText: "上传简历",
        },
      }),
    );

    expect(step).toEqual({
      id: "evt_upload",
      type: "upload",
      target: {
        strategies: [{ kind: "css", selector: "#resume" }],
        hints: {
          tagName: "input",
          inputType: "file",
          nameAttr: "resume",
          labelText: "上传简历",
        },
      },
      files: ["{{upload_resume_1}}"],
      fileNames: ["resume.pdf"],
    });
  });

  it("将宽字符 upload 占位符归一化为 upload 步骤并保留 fileNames", () => {
    const step = normalizeRecordedEvent(
      parseRecordedEvent({
        id: "evt_upload_wide_placeholder",
        type: "fill",
        timestamp: 2305,
        url: "https://example.com/upload",
        payload: {
          selector: "#evidence-files",
          testId: "evidence-files",
          inputType: "file",
          files: ["{{tenant-id}}", "{{profile.name}}", "{{中文变量}}"],
          fileNames: ["tenant.txt", "profile.txt", "zh.txt"],
          tagName: "input",
          nameAttr: "evidenceFiles",
          labelText: "上传素材",
        },
      }),
    );

    expect(step).toMatchObject({
      id: "evt_upload_wide_placeholder",
      type: "upload",
      files: ["{{tenant-id}}", "{{profile.name}}", "{{中文变量}}"],
      fileNames: ["tenant.txt", "profile.txt", "zh.txt"],
    });
  });

  it("upload 仍接受显式文件路径作为回放输入", () => {
    const step = normalizeRecordedEvent(
      parseRecordedEvent({
        id: "evt_upload_path",
        type: "fill",
        timestamp: 2310,
        url: "https://example.com/upload",
        payload: {
          selector: "#resume",
          inputType: "file",
          files: ["/tmp/resume.pdf"],
        },
      }),
    );

    expect(step).toMatchObject({
      type: "upload",
      files: ["/tmp/resume.pdf"],
    });
  });

  it("拒绝把裸文件名当作 upload 的可回放输入", () => {
    expect(() =>
      parseRecordedEvent({
        id: "evt_upload_invalid",
        type: "fill",
        timestamp: 2320,
        url: "https://example.com/upload",
        payload: {
          selector: "#resume",
          inputType: "file",
          files: ["resume.pdf"],
          fileNames: ["resume.pdf"],
        },
      }),
    ).toThrow(/可回放.*裸文件名/);
  });

  it("拒绝 files 与 fileNames 数量不一致的 upload 事件", () => {
    expect(() =>
      parseRecordedEvent({
        id: "evt_upload_length_mismatch",
        type: "fill",
        timestamp: 2325,
        url: "https://example.com/upload",
        payload: {
          selector: "#resume",
          inputType: "file",
          files: ["{{upload_resume_1}}", "{{upload_resume_2}}"],
          fileNames: ["resume.pdf"],
        },
      }),
    ).toThrow(/fileNames.*数量/);
  });

  it("拒绝把包含说明文字的 {{...}} 文本当作 upload 回放输入", () => {
    expect(() =>
      parseRecordedEvent({
        id: "evt_upload_literal_boundary",
        type: "fill",
        timestamp: 2326,
        url: "https://example.com/upload",
        payload: {
          selector: "#resume",
          inputType: "file",
          files: ["说明 {{tenant-id}}"],
          fileNames: ["resume.pdf"],
        },
      }),
    ).toThrow(/可回放/);
  });

  it("将 navigate 事件转为 navigate 步骤", () => {
    const step = normalizeRecordedEvent(
      event({
        id: "evt_nav",
        type: "navigate",
        timestamp: 0,
        url: "https://example.com/login",
        payload: { waitUntil: "networkidle" },
      }),
    );

    expect(step).toEqual({
      id: "evt_nav",
      type: "navigate",
      url: "https://example.com/login",
      waitUntil: "networkidle",
    });
  });

  it("navigate 可使用 payload.url 覆盖事件 url", () => {
    const step = normalizeRecordedEvent(
      event({
        id: "evt_nav_2",
        type: "navigate",
        timestamp: 10,
        url: "https://example.com/old",
        payload: { url: "https://example.com/new" },
      }),
    );

    expect(step).toMatchObject({
      type: "navigate",
      url: "https://example.com/new",
    });
  });

  it("不支持的事件类型返回 null", () => {
    expect(
      normalizeRecordedEvent(
        event({
          id: "evt_scroll",
          type: "scroll",
          timestamp: 3000,
          url: "https://example.com",
        }),
      ),
    ).toBeNull();
  });
});

describe("buildFlowFromEvents", () => {
  it("从事件序列构建可校验的 FlowDocument", () => {
    const events: RecordedEvent[] = [
      event({
        id: "s1",
        type: "navigate",
        timestamp: 0,
        url: "https://example.com/login",
      }),
      event({
        id: "s2",
        type: "fill",
        timestamp: 100,
        url: "https://example.com/login",
        payload: { role: "textbox", name: "用户名", value: "{{username}}" },
      }),
      event({
        id: "s3",
        type: "click",
        timestamp: 200,
        url: "https://example.com/login",
        payload: { role: "button", name: "登录" },
      }),
      event({
        id: "s4",
        type: "scroll",
        timestamp: 300,
        url: "https://example.com/login",
      }),
    ];

    const flow = buildFlowFromEvents(events, baseMeta);

    expect(flow.schemaVersion).toBe(FLOW_SCHEMA_VERSION);
    expect(flow.id).toBe("flow_rec_1");
    expect(flow.projectId).toBe("proj_1");
    expect(flow.name).toBe("录制流程");
    expect(flow.meta.source).toBe("recorded");
    expect(flow.steps).toHaveLength(3);
    expect(flow.steps.map((s) => s.type)).toEqual(["navigate", "fill", "click"]);

    expect(() => flowDocumentSchema.parse(flow)).not.toThrow();
  });

  it("无 navigate 时用首条事件的 url 自动补 open 步骤", () => {
    const events: RecordedEvent[] = [
      event({
        id: "c1",
        type: "click",
        timestamp: 100,
        url: "https://app.example.com/login",
        payload: { selector: "#email" },
      }),
      event({
        id: "f1",
        type: "fill",
        timestamp: 200,
        url: "https://app.example.com/login",
        payload: { selector: "#email", value: "user@test.com" },
      }),
    ];

    const flow = buildFlowFromEvents(events, baseMeta);

    expect(flow.steps[0]).toMatchObject({
      type: "navigate",
      url: "https://app.example.com/login",
    });
    // click(#email) + fill(#email) 合并为 fill
    expect(flow.steps).toHaveLength(2);
    expect(flow.steps.map((s) => s.type)).toEqual(["navigate", "fill"]);
  });

  it("无有效步骤时抛出校验错误", () => {
    expect(() =>
      buildFlowFromEvents(
        [
          event({
            id: "x",
            type: "keypress",
            timestamp: 0,
            url: "https://example.com",
          }),
        ],
        baseMeta,
      ),
    ).toThrow(/至少一个可归一化步骤/);
  });

  it("构建 Flow 时移除 checkbox 标签点击噪声，仅保留 setChecked", () => {
    const events: RecordedEvent[] = [
      event({
        id: "c1",
        type: "click",
        timestamp: 100,
        url: "https://app.example.com/settings",
        payload: {
          selector: 'label[for="agree"]',
          tagName: "label",
          labelText: "同意协议",
          textSample: "同意协议",
        },
      }),
      event({
        id: "c2",
        type: "click",
        timestamp: 150,
        url: "https://app.example.com/settings",
        payload: {
          selector: "#agree",
          role: "checkbox",
          name: "同意协议",
          inputType: "checkbox",
          checked: true,
          tagName: "input",
          nameAttr: "agree",
          labelText: "同意协议",
        },
      }),
    ];

    const flow = buildFlowFromEvents(events, baseMeta);

    expect(flow.steps).toHaveLength(2);
    expect(flow.steps.map((step) => step.type)).toEqual(["navigate", "setChecked"]);
  });

  it("构建 Flow 时移除 contenteditable 前置 click 噪声，仅保留 fill", () => {
    const events: RecordedEvent[] = [
      event({
        id: "n1",
        type: "navigate",
        timestamp: 0,
        url: "https://app.example.com/editor",
      }),
      event({
        id: "c1",
        type: "click",
        timestamp: 100,
        url: "https://app.example.com/editor",
        payload: {
          selector: "#editor-body",
          role: "textbox",
          name: "交接备注",
          tagName: "div",
          textSample: "需要补充库存说明",
        },
      }),
      event({
        id: "f1",
        type: "fill",
        timestamp: 150,
        url: "https://app.example.com/editor",
        payload: {
          selector: "#editor-body",
          role: "textbox",
          name: "交接备注",
          value: "需要补充库存说明",
          tagName: "div",
          textSample: "需要补充库存说明",
        },
      }),
    ];

    const flow = buildFlowFromEvents(events, baseMeta);

    expect(flow.steps).toHaveLength(2);
    expect(flow.steps.map((step) => step.type)).toEqual(["navigate", "fill"]);
    expect(flow.steps[1]).toMatchObject({
      id: "f1",
      type: "fill",
      value: "需要补充库存说明",
    });
  });

  it("构建 Flow 时去掉连续同 URL 的 navigate 噪声", () => {
    const events: RecordedEvent[] = [
      event({
        id: "n1",
        type: "navigate",
        timestamp: 0,
        url: "https://app.example.com/dashboard",
      }),
      event({
        id: "n2",
        type: "navigate",
        timestamp: 10,
        url: "https://app.example.com/dashboard",
      }),
      event({
        id: "c1",
        type: "click",
        timestamp: 20,
        url: "https://app.example.com/dashboard",
        payload: { selector: "#refresh" },
      }),
    ];

    const flow = buildFlowFromEvents(events, baseMeta);

    expect(flow.steps).toHaveLength(2);
    expect(flow.steps.map((step) => step.type)).toEqual(["navigate", "click"]);
    expect(flow.steps[0]).toMatchObject({
      id: "n2",
      type: "navigate",
      url: "https://app.example.com/dashboard",
    });
  });

  it("构建 Flow 时自动声明 upload 占位符变量", () => {
    const flow = buildFlowFromEvents(
      [
        event({
          id: "n1",
          type: "navigate",
          timestamp: 0,
          url: "https://app.example.com/upload",
        }),
        parseRecordedEvent({
          id: "u1",
          type: "fill",
          timestamp: 10,
          url: "https://app.example.com/upload",
          payload: {
            selector: "#evidence-files",
            testId: "evidence-files",
            inputType: "file",
            files: ["{{upload_evidencefiles_1}}", "{{upload_evidencefiles_2}}"],
            fileNames: ["evidence-a.txt", "evidence-b.txt"],
            tagName: "input",
            nameAttr: "evidenceFiles",
            labelText: "上传素材",
          },
        }),
      ],
      baseMeta,
    );

    expect(flow.variables).toEqual([
      {
        name: "upload_evidencefiles_1",
        type: "string",
        required: true,
      },
      {
        name: "upload_evidencefiles_2",
        type: "string",
        required: true,
      },
    ]);
  });

  it("构建 Flow 时自动声明宽字符 upload 占位符变量", () => {
    const flow = buildFlowFromEvents(
      [
        event({
          id: "n1",
          type: "navigate",
          timestamp: 0,
          url: "https://app.example.com/upload",
        }),
        parseRecordedEvent({
          id: "u1",
          type: "fill",
          timestamp: 10,
          url: "https://app.example.com/upload",
          payload: {
            selector: "#evidence-files",
            testId: "evidence-files",
            inputType: "file",
            files: ["{{tenant-id}}", "{{profile.name}}", "{{中文变量}}"],
            fileNames: ["tenant.txt", "profile.txt", "zh.txt"],
            tagName: "input",
            nameAttr: "evidenceFiles",
            labelText: "上传素材",
          },
        }),
      ],
      baseMeta,
    );

    expect(flow.variables).toEqual([
      {
        name: "tenant-id",
        type: "string",
        required: true,
      },
      {
        name: "profile.name",
        type: "string",
        required: true,
      },
      {
        name: "中文变量",
        type: "string",
        required: true,
      },
    ]);
  });

  it("构建 Flow 时在跨 URL 的提交动作后插入 urlIncludes wait", () => {
    const flow = buildFlowFromEvents(
      [
        event({
          id: "n1",
          type: "navigate",
          timestamp: 0,
          url: "https://app.example.com/search",
        }),
        event({
          id: "f1",
          type: "fill",
          timestamp: 100,
          url: "https://app.example.com/search",
          payload: {
            selector: "#keyword",
            role: "textbox",
            name: "搜索词",
            value: "flowweave",
          },
        }),
        event({
          id: "p1",
          type: "keypress",
          timestamp: 150,
          url: "https://app.example.com/search",
          payload: {
            selector: "#keyword",
            role: "textbox",
            name: "搜索词",
            key: "Enter",
          },
        }),
        event({
          id: "c1",
          type: "click",
          timestamp: 900,
          url: "https://app.example.com/results?keyword=flowweave",
          payload: {
            selector: "#detail-link",
            role: "link",
            name: "查看详情",
          },
        }),
      ],
      baseMeta,
    );

    expect(flow.steps.map((step) => step.type)).toEqual(["navigate", "fill", "press", "wait", "click"]);
    expect(flow.steps[3]).toEqual({
      id: "wait-auto-p1-c1",
      type: "wait",
      condition: "urlIncludes",
      urlIncludes: "/results?keyword=flowweave",
    });
  });

  it("构建 Flow 时在同页异步切换到新目标前插入 visible wait", () => {
    const flow = buildFlowFromEvents(
      [
        event({
          id: "n1",
          type: "navigate",
          timestamp: 0,
          url: "https://app.example.com/workbench",
        }),
        event({
          id: "c1",
          type: "click",
          timestamp: 100,
          url: "https://app.example.com/workbench",
          payload: {
            selector: "#open-panel",
            role: "button",
            name: "展开详情",
          },
        }),
        event({
          id: "f1",
          type: "fill",
          timestamp: 1100,
          url: "https://app.example.com/workbench",
          payload: {
            selector: "#panel-title",
            role: "textbox",
            name: "详情标题",
            value: "异步出现的输入框",
          },
        }),
      ],
      baseMeta,
    );

    expect(flow.steps.map((step) => step.type)).toEqual(["navigate", "click", "wait", "fill"]);
    expect(flow.steps[2]).toEqual({
      id: "wait-auto-c1-f1",
      type: "wait",
      condition: "visible",
      target: {
        strategies: [
          { kind: "role", role: "textbox", name: "详情标题" },
          { kind: "css", selector: "#panel-title" },
        ],
      },
    });
  });

  it("构建 Flow 时不会为普通连续交互宽泛插入 wait", () => {
    const flow = buildFlowFromEvents(
      [
        event({
          id: "n1",
          type: "navigate",
          timestamp: 0,
          url: "https://app.example.com/workbench",
        }),
        event({
          id: "c1",
          type: "click",
          timestamp: 100,
          url: "https://app.example.com/workbench",
          payload: {
            selector: "#open-panel",
            role: "button",
            name: "展开详情",
          },
        }),
        event({
          id: "c2",
          type: "click",
          timestamp: 220,
          url: "https://app.example.com/workbench",
          payload: {
            selector: "#confirm",
            role: "button",
            name: "确认",
          },
        }),
      ],
      baseMeta,
    );

    expect(flow.steps.map((step) => step.type)).toEqual(["navigate", "click", "click"]);
  });
});
