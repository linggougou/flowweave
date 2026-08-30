export const FLOWWEAVE_VERSION = "0.1.0";
export const FLOW_SCHEMA_VERSION_V1 = 1 as const;
export const FLOW_SCHEMA_VERSION_V2 = 2 as const;
export const SUPPORTED_FLOW_SCHEMA_VERSIONS = [
  FLOW_SCHEMA_VERSION_V1,
  FLOW_SCHEMA_VERSION_V2,
] as const;

/** 旧入口的默认版本固定为 v1；新增版本必须使用显式版本常量。 */
export const FLOW_SCHEMA_VERSION = FLOW_SCHEMA_VERSION_V1;
