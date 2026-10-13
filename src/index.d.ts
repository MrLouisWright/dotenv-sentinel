import type { Report, PolicyOptions, RuleInfo, Severity } from './core.js';
export * from './core.js';
export interface EnvEntry { key: string; value: string; line: number; quote: '"' | "'" | '`' | null; unquotedSpace: boolean; sep: '=' | ':'; }
export interface ParsedEnv { entries: EnvEntry[]; bad: Array<{ line: number; text: string; reason?: string }>; map: Record<string, string>; }
export interface VarSchema { type?: 'string' | 'number' | 'integer' | 'boolean' | 'url' | 'email' | 'port' | 'json' | 'enum'; required?: boolean; pattern?: string; enum?: Array<string | number>; minLength?: number; secret?: boolean; }
export interface Schema { vars: Record<string, VarSchema>; required: Set<string>; }
export interface RawFinding { rule: string; file: string; line?: number; location: string; message: string; evidence?: string; fix?: string; }
export interface CheckOptions extends PolicyOptions { example?: string; schema?: string | { variables: Record<string, VarSchema> } | Record<string, VarSchema>; minSecretLength?: number; git?: boolean; history?: boolean; }
export declare const VERSION: string;
export declare const RULES: Record<string, RuleInfo>;
export declare const TOOL: { name: string; version: string; rules: Record<string, RuleInfo>; title: string; emoji: string; defaultFailOn: Severity };
export declare function parseEnv(text: string): ParsedEnv;
export declare function isEnvFile(name: string): boolean;
export declare function isExample(name: string): boolean;
export declare function weakness(value: string): string | null;
export declare function loadSchema(src: string | object): Schema;
export declare function lintEnv(text: string, ctx?: { file?: string; example?: Record<string, string> | null; exampleName?: string; schema?: Schema | null; minSecretLength?: number; tracked?: boolean; ignored?: boolean }): { raw: RawFinding[]; parsed: ParsedEnv };
/** Check directories or env files. */
export declare function check(paths: string[], opts?: CheckOptions): Report;
