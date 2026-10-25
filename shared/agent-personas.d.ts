export type AgentPersona = {
  key: string;
  name: string;
  avatar: string;
};

export declare const AGENT_PERSONAS: AgentPersona[];
export declare const DEFAULT_PERSONA_KEY: string;
export declare function personaByKey(key: string | null | undefined): AgentPersona | null;
export declare function personaIndex(key: string | null | undefined): number;
export declare function personaKeyForIndex(index: number): string | null;
export declare function personaLabel(key: string | null | undefined): string;
export declare function personaPrompt(key: string | null | undefined): string;
