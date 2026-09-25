import asyncio,json,os
from playwright.async_api import async_playwright
m=json.load(open(os.path.expanduser("~/.cache/lovable-auth/session.json")))
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(headless=True); c=await b.new_context(viewport={"width":1280,"height":1800})
    for k in m["cookies"]: k["url"]="http://localhost:8080"
    await c.add_cookies(m["cookies"]); pg=await c.new_page()
    errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    await pg.goto("http://localhost:8080")
    await pg.evaluate(f"localStorage.setItem({json.dumps(m['storage_key'])},{json.dumps(json.dumps(m['session']))})")
    await pg.goto("http://localhost:8080/dashboard"); await pg.wait_for_timeout(4000)
    await pg.locator("a[href^='/notebook/']").first.click(); await pg.wait_for_timeout(4000)
    await pg.get_by_role("button",name="Ask",exact=False).first.click(); await pg.wait_for_timeout(1500)
    await pg.locator("textarea, input[type=text]").last.fill("What is the main idea?")
    await pg.keyboard.press("Enter"); await pg.wait_for_timeout(30000)
    await pg.screenshot(path="ask.png"); print("errors",errs)
    await b.close()
asyncio.run(main())
