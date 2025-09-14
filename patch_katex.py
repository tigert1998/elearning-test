import re

if __name__ == "__main__":
    with open("katex/katex.min.css", "r") as f:
        content = f.read()
    for ext, typ in [("woff", "woff"), ("ttf", "truetype")]:
        content = re.sub(
            f',url\\(fonts/KaTeX_[^\\.]+\\.{ext}\\) +format\\("{typ}"\\)',
            "",
            content,
        )
    content = re.sub(
        "url\\(fonts/KaTeX_",
        "url(chrome-extension://__MSG_@@extension_id__/katex/fonts/KaTeX_",
        content,
    )
    with open("katex/katex.min.patched.css", "w") as f:
        f.write(content)

    with open("katex/contrib/auto-render.min.js", "r") as f:
        content = f.read()
    content = content.replace('require("katex")', 'require("../katex.min.js")')
    with open("katex/contrib/auto-render.min.patched.js", "w") as f:
        f.write(content)
