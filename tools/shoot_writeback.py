"""UI walk-through of the Execute in S/4HANA page (headless Playwright).

Drives the real page against a running app and asserts the governance holds in
the browser: the approve button stays disabled for self-approval, missing
acknowledgements or a wrong phrase; the request posts only after approval.
Screenshots go to docs/writeback/. Resets the simulated S/4HANA before and after.

    APP=http://localhost:5179 python3 tools/shoot_writeback.py
"""
import asyncio
import json
import os
import pathlib
import urllib.request

from playwright.async_api import async_playwright

APP = os.environ.get("APP", "http://localhost:5179").rstrip("/")
OUT = pathlib.Path(__file__).resolve().parent.parent / "docs" / "writeback"
REQUESTER = "Maria Chen (Supply Planner)"
APPROVER = "Raj Patel (Operations Director)"


def reset():
    req = urllib.request.Request(f"{APP}/api/writeback/reset", data=b"{}", headers={"content-type": "application/json"})
    print("reset:", json.loads(urllib.request.urlopen(req, timeout=120).read())["message"])


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    reset()
    async with async_playwright() as p:
        br = await p.chromium.launch()
        pg = await br.new_page(viewport={"width": 1600, "height": 1000}, device_scale_factor=1.5)
        section = pg.locator("div.border-indigo-200", has_text="Execute in SAP S/4HANA").first
        diagram = pg.locator("div.rounded-lg", has_text="How the plan reaches S/4HANA").first

        async def shot(name, target=None):
            await pg.wait_for_timeout(600)
            await (target or pg).screenshot(path=str(OUT / f"{name}.png"))
            print("shot", name)

        await pg.goto(f"{APP}/#scenario"); await pg.wait_for_load_state("networkidle"); await pg.wait_for_timeout(6000)
        await pg.evaluate("location.hash='mitigation'"); await pg.wait_for_timeout(5000)
        await pg.get_by_role("button", name="Execute in S/4HANA →").click()   # the link card on Mitigation
        await pg.wait_for_timeout(3000)
        assert await pg.evaluate("location.hash") == "#execute"
        await shot("00_execute_page", None)
        await pg.get_by_role("button", name="◇ Reassign Delivering Plant", exact=False).first.click()
        await shot("01_contracts_and_raise", section)

        await pg.get_by_role("button", name="Raise change request").click()
        await pg.get_by_text("SUBMITTED", exact=True).wait_for(timeout=120000)
        await shot("02_change_request_review", section)
        await shot("12_process_submitted", diagram)

        await pg.get_by_role("button", name="Review and approve changes to S/4HANA…").click()
        dialog = pg.get_by_role("dialog")
        approve = dialog.get_by_role("button", name="Approve changes to S/4HANA")
        await shot("03_approval_dialog_empty", dialog)

        await dialog.get_by_placeholder("e.g. Raj Patel (Operations Director)").fill(REQUESTER)
        for box in await dialog.get_by_role("checkbox").all():
            await box.check()
        await dialog.locator("input.font-mono").fill("POST TO S4HANA")
        assert await approve.is_disabled(), "self-approval must be blocked"
        await shot("04_self_approval_blocked", dialog)

        await dialog.get_by_placeholder("e.g. Raj Patel (Operations Director)").fill(APPROVER)
        await dialog.locator("input.font-mono").fill("post to s4hana")
        assert await approve.is_disabled(), "wrong confirmation phrase must be blocked"
        await dialog.get_by_role("checkbox").first.uncheck()
        await dialog.locator("input.font-mono").fill("POST TO S4HANA")
        assert await approve.is_disabled(), "missing acknowledgement must be blocked"
        await dialog.get_by_role("checkbox").first.check()
        await dialog.locator("textarea").fill("Approved for hurricane recovery; customers notified by account teams.")
        assert await approve.is_enabled(), "a complete approval must be allowed"
        await shot("05_approval_ready", dialog)

        await approve.click()
        await pg.get_by_text("APPROVED", exact=True).wait_for(timeout=120000)
        await shot("06_approved_ready_to_post", section)

        await section.get_by_role("button", name="Post 4 changes to S/4HANA").click()
        await pg.get_by_text("POSTED", exact=True).wait_for(timeout=180000)
        await section.scroll_into_view_if_needed()
        await shot("07_posted", section)
        await shot("08_posted_page", None)
        await diagram.scroll_into_view_if_needed()
        await shot("13_process_posted", diagram)

        await section.get_by_role("button", name="Reverse these changes (demo reset)").click()
        await pg.get_by_text("REVERSED", exact=True).wait_for(timeout=180000)
        await shot("09_reversed", section)
        await br.close()
    reset()
    print("UI walk-through passed")


if __name__ == "__main__":
    asyncio.run(main())
