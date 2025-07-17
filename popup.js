let button = document.getElementById("button")

button.onclick = () => {
    function constructFileListHTML(fileList) {
        let ret = "<p>搜索到题库列表：</p><ul>";
        for (let i = 0; i < fileList.length; i++) {
            ret += `<li>${fileList[i]}</li>`;
        }
        ret += "</ul>";
        return ret;
    }

    chrome.runtime.getPackageDirectoryEntry(root => {
        root.getDirectory('tiku', {}, function (directoryEntry) {
            let reader = directoryEntry.createReader();
            reader.readEntries(function (entries) {
                let fileList = [];
                entries.forEach((entry) => {
                    if (entry.name.match(/\.xlsx$/) && !entry.name.startsWith("~$") && !entry.name.startsWith(".~")) {
                        fileList.push(entry.name);
                    }
                });
                let element = document.getElementById("file-list");
                element.innerHTML = constructFileListHTML(fileList);
                chrome.storage.local.set({ eLearningTestFileList: fileList });
            });
        });
    });
};
