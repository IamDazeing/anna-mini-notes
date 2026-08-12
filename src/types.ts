export type Note = {
  id: string;
  content: string;
  order: number;
  createdAt: string;
};

export type AnnaApi = {
  storage: {
    get(args: { key: string }): Promise<{ value?: unknown }>;
    set(args: { key: string; value: unknown }): Promise<unknown>;
  };
  tools: {
    invoke(args: {
      tool_id: string;
      method: string;
      args: Record<string, unknown>;
    }): Promise<unknown>;
  };
};

