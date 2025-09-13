class CheckboxList extends HTMLElement {
    static observedAttributes = ["list", "chrome-storage-name", "list-init"];

    static numGeneratedIDs = 0;

    constructor() {
        super();
    }

    #updateList(list) {
        this.shadowRoot.replaceChildren();
        list.forEach((obj, i) => {
            let div = document.createElement("div");
            if (obj.choice != null) {
                div.innerHTML = `<div>${obj.name}</div>`;
                obj.choices.forEach((choice, choiceIndex) => {
                    let id = `checkbox-list-id-${CheckboxList.numGeneratedIDs++}`;
                    let e = document.createElement("div");
                    e.innerHTML = `<label><input type="radio" name=${obj.name} id=${id} ${choiceIndex === obj.choice ? "checked" : ""}/>${choice}</label>`;
                    e.style["padding-left"] = "4px";
                    div.appendChild(e);
                    div.querySelector(`#${id}`).onclick = () => {
                        let newList = list;
                        newList[i].choice = choiceIndex;
                        this.setAttribute("list", JSON.stringify(newList));
                    };
                });
            } else {
                let id = `checkbox-list-id-${CheckboxList.numGeneratedIDs++}`;
                div.innerHTML = `<label><input type="checkbox" id=${id} ${obj[1] ? "checked" : ""}/>${obj[0]}</label>`;
                div.querySelector(`#${id}`).onclick = () => {
                    let newList = list;
                    newList[i][1] = !newList[i][1];
                    this.setAttribute("list", JSON.stringify(newList));
                };
            }
            this.shadowRoot.appendChild(div);
        });
    }

    connectedCallback() {
        this.attachShadow({ mode: "open" });
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === "list") {
            let list = JSON.parse(newValue);
            this.#updateList(list);
            let chromeStorageName = this.getAttribute("chrome-storage-name");
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

document.getElementById("update-file-list-btn").onclick = () => {
    chrome.runtime.getPackageDirectoryEntry(root => {
        root.getDirectory('tiku', {}, (directoryEntry) => {
            let reader = directoryEntry.createReader();
            reader.readEntries((entries) => {
                let list = [];
                entries.forEach((entry) => {
                    if (entry.name.match(/\.xlsx?$/i) && !entry.name.startsWith("~$") && !entry.name.startsWith(".~")) {
                        list.push([entry.name, true]);
                    }
                });
                document.getElementById("file-list").setAttribute("list", JSON.stringify(list));
            });
        });
    });
};

let oneClickCompleteBtn = document.getElementById("one-click-complete-btn");

oneClickCompleteBtn.onclick = () => {
    let element = document.getElementById("one-click-complete-result");
    oneClickCompleteBtn.disabled = true;
    element.innerHTML = "<p>自动答题中，请耐心等待。</p>";
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        let tab = tabs[0];
        chrome.tabs.sendMessage(tab.id, "elearning-test-one-click-complete", (response) => {
            if (chrome.runtime.lastError) {
                element.innerHTML = `<p>发送消息时遇到错误：${chrome.runtime.lastError.message}</p><p>请确认是否打开了答题页面，或尝试重启浏览器。</p>`;
            } else {
                let html = "";
                html = `<p>匹配题目数：${response.results.match}</p><p>未匹配题目数：${response.results.notMatch}</p>`;
                if (response.results.errors.length > 0) {
                    html += "<p>如遇大量错误，请检查题库列表是否更新。</p>";
                }
                response.results.errors.forEach((error) => {
                    html += `<p>匹配第${error.index + 1}题时遇到错误：${error.reason}</p>`;
                });
                element.innerHTML = html;
            }
            oneClickCompleteBtn.disabled = false;
        });
    });
};
