declare const chrome: {
  runtime: {
    lastError?: { message?: string };
  };
  storage: {
    local: {
      get(
        defaults: object,
        callback: (items: Record<string, unknown>) => void,
      ): void;
      set(items: object, callback?: () => void): void;
    };
    onChanged: {
      addListener(
        callback: (
          changes: Record<string, { newValue?: unknown }>,
          areaName: string,
        ) => void,
      ): void;
    };
  };
  tabs: {
    query(
      queryInfo: { active?: boolean; currentWindow?: boolean },
      callback: (tabs: Array<{ id?: number; url?: string }>) => void,
    ): void;
    reload(
      tabId?: number,
      reloadProperties?: { bypassCache?: boolean },
      callback?: () => void,
    ): void;
  };
};
