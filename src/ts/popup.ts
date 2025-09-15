import { OneClickCompleteResult, CheckboxListConfig } from "./common";

class CheckboxList extends HTMLElement {
    static observedAttributes = ["list", "chrome-storage-name", "list-init"];

    static numGeneratedIDs = 0;

    constructor() {
        super();
    }

    #updateList(list: CheckboxListConfig) {
        (this.shadowRoot as ShadowRoot).replaceChildren();
        list.forEach((obj, i) => {
            let div = document.createElement("div");
            if (obj.type === "radio") {
                div.innerHTML = `<div>${obj.name}</div>`;
                obj.choices.forEach((choice, choiceIndex) => {
                    let id = `checkbox-list-id-${CheckboxList.numGeneratedIDs++}`;
                    let e = document.createElement("div");
                    e.innerHTML = `<label><input type="radio" name=${obj.name} id=${id} ${choiceIndex === obj.choice ? "checked" : ""}/>${choice}</label>`;
                    e.style["padding-left"] = "4px";
                    div.appendChild(e);
                    (div.querySelector(`#${id}`) as HTMLElement).onclick = () => {
                        let newList = list;
                        obj.choice = choiceIndex;
                        newList[i] = obj;
                        this.setAttribute("list", JSON.stringify(newList));
                    };
                });
            } else if (obj.type === "checkbox") {
                let id = `checkbox-list-id-${CheckboxList.numGeneratedIDs++}`;
                div.innerHTML = `<label><input type="checkbox" id=${id} ${obj.checked ? "checked" : ""}/>${obj.name}</label>`;
                (div.querySelector(`#${id}`) as HTMLElement).onclick = () => {
                    let newList = list;
                    obj.checked = !obj.checked;
                    newList[i] = obj;
                    this.setAttribute("list", JSON.stringify(newList));
                };
            }
            (this.shadowRoot as ShadowRoot).appendChild(div);
        });
    }

    connectedCallback() {
        this.attachShadow({ mode: "open" });
    }

    attributeChangedCallback(name: string, oldValue: any, newValue: any) {
        if (name === "list") {
            let list = JSON.parse(newValue);
            this.#updateList(list);
            let chromeStorageName = this.getAttribute("chrome-storage-name") as string;
            chrome.storage.local.set({ [chromeStorageName]: list });
        } else if (name === "chrome-storage-name") {
            let chromeStorageName = newValue;
            chrome.storage.local.get(chromeStorageName, (result) => {
                let list = result[chromeStorageName];
                if (list != null) this.setAttribute("list", JSON.stringify(list));
            });
        } else if (name === "list-init") {
            if (!this.hasAttribute("list")) this.setAttribute("list", newValue);
        }
    }
};

customElements.define("checkbox-list", CheckboxList);

(document.getElementById("update-file-list-btn") as HTMLElement).onclick = () => {
    chrome.runtime.getPackageDirectoryEntry((root: DirectoryEntry) => {
        (root as FileSystemDirectoryEntry).getDirectory('tiku', {}, (directoryEntry) => {
            let reader = (directoryEntry as FileSystemDirectoryEntry).createReader();
            reader.readEntries((entries) => {
                let list: CheckboxListConfig = [];
                entries.forEach((entry) => {
                    if (entry.name.match(/\.xlsx?$/i) && !entry.name.startsWith("~$") && !entry.name.startsWith(".~")) {
                        list.push({ type: "checkbox", name: entry.name, checked: true });
                    }
                });
                (document.getElementById("file-list") as CheckboxList).setAttribute("list", JSON.stringify(list));
            });
        }, () => {
            (document.getElementById("file-list") as CheckboxList).setAttribute("list", JSON.stringify([]));
        });
    });
};

let oneClickCompleteBtn = document.getElementById("one-click-complete-btn") as HTMLButtonElement;

oneClickCompleteBtn.onclick = () => {
    let element = document.getElementById("one-click-complete-result") as HTMLElement;
    oneClickCompleteBtn.disabled = true;
    element.innerHTML = "<p>自动答题中，请耐心等待。</p>";
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        let tab = tabs[0];
        if (tab.id == null) {
            element.innerHTML = "<p>请确认是否打开了答题页面，或尝试重启浏览器。</p>";
            return;
        }
        chrome.tabs.sendMessage(tab.id, "elearning-test-one-click-complete", undefined, (response: OneClickCompleteResult) => {
            let html = "";
            html = `<p>匹配题目数：${response.match}</p><p>未匹配题目数：${response.notMatch}</p>`;
            if (response.errors.length > 0) {
                html += "<p>如遇大量错误，请检查题库列表是否更新。</p>";
            }
            response.errors.forEach((error) => {
                html += `<p>匹配第${error.index + 1}题时遇到错误：${error.reason}</p>`;
            });
            element.innerHTML = html;

            oneClickCompleteBtn.disabled = false;
        });
    });
};
