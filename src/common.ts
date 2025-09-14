export type SearchInExcelRow = {
    rowIndex: number,
    headers: string[],
    cells: any[],
    file: string,
    sheet: string,
};

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
