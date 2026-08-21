import markdown, re, pathlib

src = pathlib.Path("README.md").read_text(encoding="utf-8")

# 去掉用于居中的原始 HTML 包裹标签，让内部 markdown 能被正常渲染（预览用，居中仅为装饰）
src = src.replace('<div align="center">', '').replace('</div>', '')
src = src.replace('<p align="center">', '').replace('</p>', '')

md = markdown.Markdown(extensions=['tables', 'fenced_code', 'attr_list'])
body = md.convert(src)

CSS = """
<style>
  :root { color-scheme: light; }
  body {
    max-width: 920px; margin: 0 auto; padding: 40px 28px 80px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
                 "Hiragino Sans GB", "Microsoft YaHei", Helvetica, Arial, sans-serif;
    font-size: 16px; line-height: 1.7; color: #1f2328; background: #ffffff;
  }
  h1, h2, h3 { line-height: 1.3; margin-top: 1.6em; margin-bottom: .6em; font-weight: 700; }
  h1 { font-size: 2.0em; border-bottom: 1px solid #d8dee4; padding-bottom: .3em; text-align: center; }
  h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: .25em; }
  h3 { font-size: 1.2em; }
  p { margin: .8em 0; }
  a { color: #0969da; text-decoration: none; }
  a:hover { text-decoration: underline; }
  img { max-width: 100%; }
  code { background: #eff1f3; padding: .15em .4em; border-radius: 6px; font-size: .9em;
         font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
  pre { background: #f6f8fa; padding: 16px; border-radius: 8px; overflow: auto; }
  pre code { background: none; padding: 0; }
  blockquote { margin: 1em 0; padding: .4em 1em; color: #57606a;
               border-left: 4px solid #d0d7de; background: #f6f8fa; border-radius: 0 6px 6px 0; }
  ul, ol { padding-left: 1.6em; }
  li { margin: .3em 0; }
  hr { border: none; border-top: 1px solid #d8dee4; margin: 2em 0; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: .95em; }
  th, td { border: 1px solid #d0d7de; padding: 8px 12px; text-align: left; }
  th { background: #f6f8fa; font-weight: 600; }
  tr:nth-child(even) td { background: #fbfcfd; }
  .markdown-body img { vertical-align: middle; }
</style>
"""

html = f"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>README 预览</title>{CSS}</head>
<body class="markdown-body">
{body}
</body></html>"""

pathlib.Path("README-preview.html").write_text(html, encoding="utf-8")
print("written README-preview.html", len(html), "bytes")
