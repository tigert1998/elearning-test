let button = document.getElementById("button")

button.onclick = () => {
    function constructFileListHTML(fileList) {
        let ret = "<p>搜索到题库列表：</p><ul>";
        for (let i = 0; i < fileList.length; i++) {
            ret += `<li>${fileList[i]}</li>`;
        }
        ret += "</ul><p>后缀树索引构建完成。</p>";
        return ret;
    }

    chrome.runtime.getPackageDirectoryEntry((root) => {
        root.getDirectory('tiku', {}, (directoryEntry) => {
            let reader = directoryEntry.createReader();
            reader.readEntries(async (entries) => {
                let fileList = [];
                entries.forEach((entry) => {
                    if (entry.name.match(/\.xlsx$/) && !entry.name.startsWith("~$") && !entry.name.startsWith(".~")) {
                        fileList.push(entry.name);
                    }
                });

                let workbooks = await Promise.all(fileList.map(async (file) => {
                    const fileUrl = chrome.runtime.getURL(`tiku/${file}`);
                    const response = await fetch(fileUrl);

                    if (!response.ok) return Promise.reject(new Error(`Fail to load file: ${file}`));

                    const arrayBuffer = await response.arrayBuffer();
                    return XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
                }));

                let cellID = 0;
                let rows = [];
                let cellRowID = {};
                let tree = new Suffixer();
                workbooks.forEach((workbook) => {
                    workbook.SheetNames.forEach(sheetName => {
                        const worksheet = workbook.Sheets[sheetName];
                        const sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                        let headers = sheetData[0];
                        for (let i = 1; i < sheetData.length; i++) {
                            rows.push([headers, sheetData[i]]);

                            sheetData[i].forEach((cell) => {
                                let cellString = String(cell).replace(/\s+/g, "").toLowerCase();
                                if (cellString.length > 0) {
                                    cellRowID[cellID] = i - 1;
                                    cellID += 1;
                                    tree.addString(cellString);
                                }
                            });
                        }
                    });
                });

                chrome.storage.local.set({ rows: rows, treeJSON: tree.serialize(), cellRowID: cellRowID }).then(() => {
                    let element = document.getElementById("file-list");
                    element.innerHTML = constructFileListHTML(fileList);
                });
            });
        });
    });
};
