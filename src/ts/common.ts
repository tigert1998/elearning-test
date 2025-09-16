export type SearchInExcelRow = {
    file: string;
    sheet: string;
    rowIndex: number;
    headers: string[];
    values: any[];
};

export type OneClickCompleteResult = {
    match: number;
    notMatch: number;
    errors: {
        index: number;
        reason: string;
    }[];
};

export type ServiceWorkerRequestMessage = {
    bankSearchTerm?: string;
    llmAutoSolve?: {
        type: "radio" | "checkbox";
        problem: string;
        options: string[];
    };
};

export type ServiceWorkerResponseMessage = {
    searchInExcelRows?: SearchInExcelRow[];
    llmAutoSolveResult?: number[];
    error?: string;
};

export type RadioConfig = { type: "radio", name: string, choice: number, choices: string[] };
export type CheckboxConfig = { type: "checkbox", name: string, checked: boolean };
export type CheckboxListConfig = (RadioConfig | CheckboxConfig)[];

export let isSubsetOf = (x: Set<string>, y: Set<string>) => {
    for (let k of x.keys()) {
        if (!y.has(k)) return false;
    }
    return true;
};

export let buildSearchRegex = (text: string): string => {
    return text.replace(/\s+/g, "")
        .split('')
        .map(c => c.replace(/[.*+?^${}()|\[\]\\]/g, '\\$&'))
        .join('\\s*');
};
