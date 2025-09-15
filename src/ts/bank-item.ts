import { isSubsetOf, buildSearchRegex } from "./common";


type Cell = { header: string, value: any };

class Cells {
    cells: Cell[];
    #obj: { [key: string]: any };

    constructor(cells: Cell[]) {
        this.cells = cells;
        this.#obj = {};
        for (let cell of cells) this.#obj[cell.header] = cell.value;
    }

    findHeader(substr: string) {
        let ks: string[] = [];
        for (let cell of this.cells) {
            if (cell.header.includes(substr)) ks.push(cell.header);
        }
        return ks;
    }

    get(header: string): any {
        return this.#obj[header];
    }
};

export class BankItem {
    problem: string;
    answer: string;
    options: { [key: string]: string };

    static #rules = [
        (cells: Cells) => {
            // 题干    选项A    选项B    选项C    选项D    答案

            let ansKey = cells.findHeader("答案");
            if (ansKey.length !== 1) return null;
            let problemKey = cells.findHeader("题干");
            if (problemKey.length !== 1) return null;

            let ans = cells.get(ansKey[0]);
            if (ans == null) return null;
            let problem = cells.get(problemKey[0]);
            if (problem == null) return null;

            let obj: { "problem": string, "answer": string, "options": { [key: string]: string } } =
                { "problem": String(problem), "answer": String(ans).trim(), "options": {} };
            for (let cell of cells.cells) {
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
        (cells: Cells) => {
            // 题干               选项              答案
            // 测试题目的题干     A-选项1|B-选项2     B

            let ansKey = cells.findHeader("答案");
            if (ansKey.length !== 1) return null;
            let problemKey = cells.findHeader("题干");
            if (problemKey.length !== 1) return null;

            let ans = cells.get(ansKey[0]);
            if (ans == null) return null;
            let options: string = cells.get("选项");
            if (options == null) return null;
            let problem = cells.get(problemKey[0]);
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

    constructor(problem: string, options: { [key: string]: string }, answer: string) {
        this.problem = problem;
        this.options = options;
        this.answer = answer;
    }

    serialize() {
        return {
            problem: this.problem,
            options: this.options,
            answer: this.answer
        }
    }

    static deserialize(obj: {
        problem: string;
        answer: string;
        options: {
            [key: string]: string;
        };
    }) {
        return new BankItem(obj.problem, obj.options, obj.answer);
    }

    static fromHeadersAndValues(headers: string[], values: any[]) {
        let cells_array: Cell[] = [];
        for (let i = 0; i < headers.length; i++) {
            cells_array.push({ header: headers[i], value: values[i] });
        }
        let cells = new Cells(cells_array);
        for (let func of BankItem.#rules) {
            let obj = func(cells);
            if (obj != null) {
                return BankItem.deserialize(obj);
            }
        }

        return null;
    }

    toHighlightedHTML(regExp: RegExp) {
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

        text = `【题干】${matchRegExp(this.problem)}<br>`;
        for (let [k, v] of Object.entries(this.options)) {
            let line = `【选项${k}】${matchRegExp(v)}`;
            if (this.answer.includes(k)) {
                text += `<span class="elearning-test-answer">${line}</span><br>`;
            } else {
                text += `${line}<br>`;
            }
        }
        text += `【答案】${matchRegExp(this.answer)}`;

        if (valid) return text;
        return null;
    }
};


export let toHighlightedHTMLFallback = (headers: string[], values: any[], regExp: RegExp) => {
    let text = "";
    for (let i = 0; i < headers.length; i++) {
        if (values[i] == null || String(values[i]).trim() === "") continue;
        text += `【${headers[i]}】${values[i]}`;
    }

    if (text.match(regExp)) {
        return text.replace(regExp, `<span class="elearning-test-match">$&</span>`);
    }
    return null;
};