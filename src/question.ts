import { isSubsetOf, buildSearchRegex } from "./common";

export type Question = {
    problem: string,
    answer: string,
    options: { [key: string]: string }
};

type Cell = { header: string, value: any };

let findKeys = (cells: Cell[], substr: string) => {
    let ks: string[] = [];
    for (let cell of cells) {
        if (cell.header.includes(substr)) ks.push(cell.header);
    }
    return ks;
};

let cellsToObject = (cells: Cell[]): { [key: string]: any } => {
    let obj = {};
    for (let cell of cells) obj[cell.header] = cell.value;
    return obj;
};

let parseQuestionRules = [
    (cells: Cell[]): Question | null => {
        // 题干    选项A    选项B    选项C    选项D    答案

        let ansKey = findKeys(cells, "答案");
        if (ansKey.length !== 1) return null;
        let problemKey = findKeys(cells, "题干");
        if (problemKey.length !== 1) return null;

        let object = cellsToObject(cells);
        let ans = object[ansKey[0]];
        if (ans == null) return null;
        let problem = object[problemKey[0]];
        if (problem == null) return null;

        let obj: { "problem": string, "answer": string, "options": { [key: string]: string } } =
            { "problem": String(problem), "answer": String(ans).trim(), "options": {} };
        for (let cell of cells) {
            if (!cell.header.startsWith("选项") || cell.header.length <= 2 || cell.value == null || String(cell.value).trim() === "") continue;
            obj["options"][cell.header.substring(2).trim()] = String(cell.value).trim();
        }
        if (!isSubsetOf(new Set(obj["answer"]), new Set(Object.keys(obj["options"])))) {
            let regex = new RegExp(buildSearchRegex(obj["answer"]), "gi");
            for (let [k, v] of Object.entries(obj["options"])) {
                if (v.match(regex)) {
                    obj["answer"] = k;
                    return obj;
                }
            }
            return null;
        }

        return obj;
    },
    (cells: Cell[]): Question | null => {
        // 题干               选项              答案
        // 测试题目的题干     A-选项1|B-选项2     B

        let ansKey = findKeys(cells, "答案");
        if (ansKey.length !== 1) return null;
        let problemKey = findKeys(cells, "题干");
        if (problemKey.length !== 1) return null;

        let object = cellsToObject(cells);
        let ans = object[ansKey[0]];
        if (ans == null) return null;
        let options: string = object["选项"];
        if (options == null) return null;
        let problem = object[problemKey[0]];
        if (problem == null) return null;

        let obj: { "problem": string, "answer": string, "options": { [key: string]: string } }
            = { "problem": String(problem), "answer": String(ans).trim(), "options": {} };

        options.split("|").forEach((opt) => {
            let c = opt.trim()[0];
            obj["options"][c] = opt.trim().substring(2).trim();
        });
        if (!isSubsetOf(new Set(obj["answer"]), new Set(Object.keys(obj["options"])))) return null;

        return obj;
    },
];

export let parseQuestion = (row: { headers: string[], cells: any[] }): string | Question => {
    let cells: Cell[] = [];
    for (let i = 0; i < row.headers.length; i++) {
        cells.push({ header: row.headers[i], value: row.cells[i] });
    }
    for (let func of parseQuestionRules) {
        let obj = func(cells);
        if (obj != null) return obj;
    }

    let text = "";
    for (let cell of cells) {
        if (cell.value == null || String(cell.value).trim() === "") continue;
        text += `【${cell.header}】${cell.value}`;
    }
    return text;
};

export let buildQuestionHTML = (obj: string | Question, regExp: RegExp) => {
    let text = "";

    let valid = false;
    let matchRegExp = (text: string) => {
        if (text.match(regExp)) {
            valid = true;
            return text.replace(regExp, `<span class="elearning-test-match">$&</span>`);
        } else {
            return text;
        }
    };

    if (typeof obj === "string") text = matchRegExp(obj);
    else {
        text = `【题干】${matchRegExp(obj["problem"])}<br>`;
        for (let [k, v] of Object.entries(obj["options"])) {
            let line = `【选项${k}】${matchRegExp(v)}`;
            if (obj["answer"].includes(k)) {
                text += `<span class="elearning-test-answer">${line}</span><br>`;
            } else {
                text += `${line}<br>`;
            }
        }
        text += `【答案】${matchRegExp(obj["answer"])}`;
    }

    if (valid) return text;
    return null;
}