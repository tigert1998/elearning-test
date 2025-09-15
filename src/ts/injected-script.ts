window.addEventListener("load", (event) => {
    console.log("The hacking script is injected.");

    // 禁止阻止右键
    document.oncontextmenu = null;

    // 禁止切屏警告和发送消息至后台
    window.onblur = null;

    // 禁止阻止复制、粘贴、剪切弹窗
    if ("$" in window && typeof (window.$ as any).fn?.jquery === "string") {
        let jq = window.$ as any;
        let version: number[] = jq.fn.jquery.split(".").map((s: string) => parseInt(s, 10));
        console.log(`JQuery is detected: ${jq}`);
        console.log(`JQuery version: ${JSON.stringify(version)}`);
        if (version[0] <= 0 || (version[0] === 1 && version[1] <= 6)) {
            jq("body").unbind("copy");
            jq("body").unbind("paste");
            jq("body").unbind("cut");
        } else {
            jq("body").off("copy");
            jq("body").off("paste");
            jq("body").off("cut");
        }
    }

    // 禁止阻止选中
    document.querySelectorAll("i, label, span, b, p, div").forEach((element) => {
        for (let p of [
            "-moz-user-select",
            "-webkit-user-select",
            "-ms-user-select",
            "-khtml-user-select",
            "-o-user-select",
            "user-select"
        ]) {
            (element as HTMLElement).style.setProperty(p, "text");
        }
    });
});