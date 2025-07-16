importScripts('xlsx.full.min.js'); // 确保在项目中包含XLSX库

// 监听来自content_script.js的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    searchInExcel(request.text).then(result => {
        sendResponse(result);
    }).catch(error => {
        console.error('Fail to search: ', error);
        sendResponse([]);
    });
    return true; // 保持连接开放以支持异步响应
});

async function searchInExcel(searchText) {
    let fileList = await new Promise((resolve, reject) => {
        chrome.storage.local.get('eLearningTestFileList', (result) => {
            let fileList = result.eLearningTestFileList;
            resolve(fileList);
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
            const sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 2 });

            // 搜索匹配的行
            sheetData.forEach((row, rowIndex) => {
                if (Object.values(row).some((cell) => String(cell).includes(searchText))) {
                    results.push({
                        rowIndex: rowIndex,
                        row: row,
                        file: file,
                        sheet: sheetName
                    });
                }
            });
        });

        return results;
    }));

    let results = [];
    arrays.forEach((arr) => results = results.concat(arr));
    return results;
}
