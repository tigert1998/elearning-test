importScripts('xlsx.full.min.js');

// 监听来自content_script.js的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    searchInExcel(request.searchTerm).then((results) => {
        sendResponse({ results: results, error: null });
    }).catch((error) => {
        sendResponse({ results: null, error: error.stack });
    });
    return true; // 保持连接开放以支持异步响应
});

async function searchInExcel(searchTerm) {
    let regExp = new RegExp(searchTerm, "gi");

    let fileList = await new Promise((resolve, reject) => {
        chrome.storage.local.get('eLearningTestFileList', (result) => {
            let fileList = result.eLearningTestFileList;
            if (fileList == null) reject(new Error("Sheet list is not prepared"));
            else resolve(fileList);
        });
    });

    let arrays = await Promise.all(fileList.map(async (file) => {
        const fileUrl = chrome.runtime.getURL(`tiku/${file}`);
        const response = await fetch(fileUrl);

        if (!response.ok) return Promise.reject(new Error(`Fail to load file: ${file}`));

        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });

        let results = [];

        // 遍历所有工作表
        workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            if (sheetData.length === 0) return;
            let headers = sheetData[0].map((header) => header.trim());

            for (let i = 1; i < sheetData.length; i++) {
                let cells = sheetData[i];
                if (cells.some((cell) => String(cell).match(regExp))) {
                    let row = headers.map((header, idx) => [header, cells[idx]]);
                    results.push({
                        rowIndex: i - 1,
                        row: row,
                        file: file,
                        sheet: sheetName
                    });
                }
            }
        });

        return results;
    }));

    let results = [];
    arrays.forEach((arr) => results = results.concat(arr));
    return results;
}
