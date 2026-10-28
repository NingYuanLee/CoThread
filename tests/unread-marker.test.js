import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extendUnreadAnchor,
  freezeUnreadAnchor,
  locateUnreadMarker,
  planUnreadScroll,
} from "../web/unread-marker.ts";

const message = (id, sequence) => ({ id, sequence });

test("进入时没有未读就不冻结分割线", () => {
  assert.equal(freezeUnreadAnchor([message("a", "1"), message("b", "2")], "2"), null);
  assert.equal(freezeUnreadAnchor([], "0"), null);
  assert.equal(freezeUnreadAnchor([message("a", "4")], undefined), null);
});

test("冻结已读序号时忽略乐观消息和无序号消息", () => {
  const anchor = freezeUnreadAnchor(
    [
      message("a", "3"),
      message("optimistic:1", "99"),
      { id: "draft", sequence: "" },
      message("b", "8"),
    ],
    "3",
  );
  assert.deepEqual(anchor, { lastRead: 3n, entryMax: 8n });
  assert.equal(
    freezeUnreadAnchor(
      [message("a", "8"), { id: "saved", sequence: "9", render_key: "optimistic:saved" }],
      "8",
    ),
    null,
  );
});

test("已读序号未变时，后到的历史并进未读边界", () => {
  const cached = freezeUnreadAnchor([message("a", "10")], "10");
  assert.equal(cached, null);
  const extended = extendUnreadAnchor(cached, [message("a", "10"), message("b", "14")], "10");
  assert.deepEqual(extended, { lastRead: 10n, entryMax: 14n });
  assert.equal(
    extendUnreadAnchor(
      extended,
      [message("a", "10"), message("b", "14"), message("c", "18")],
      "12",
    ),
    extended,
  );
});

test("分割线放在进入时第一条未读消息之前", () => {
  const anchor = { lastRead: 4n, entryMax: 9n };
  const timeline = [message("a", "2"), message("b", "5"), message("c", "9"), message("live", "12")];
  assert.deepEqual(locateUnreadMarker(timeline, timeline, anchor, false), {
    kind: "before",
    messageId: "b",
  });
});

test("停留期间新到的消息不成为分割线", () => {
  const anchor = { lastRead: 10n, entryMax: 10n };
  assert.equal(freezeUnreadAnchor([message("a", "10")], "10"), null);
  const later = freezeUnreadAnchor([message("a", "10"), message("b", "11")], "10");
  assert.deepEqual(later, { lastRead: 10n, entryMax: 11n });
  const frozen = { lastRead: 10n, entryMax: 10n };
  assert.deepEqual(
    locateUnreadMarker(
      [message("a", "10"), message("live", "11")],
      [message("a", "10")],
      frozen,
      false,
    ),
    { kind: "none" },
  );
});

test("未读起点还在更早的历史里时先加载，而不是把线画在当前页顶", () => {
  const anchor = { lastRead: 1n, entryMax: 80n };
  const page = [message("p", "40"), message("q", "80")];
  assert.deepEqual(locateUnreadMarker(page, page, anchor, true), { kind: "loading" });
  assert.deepEqual(locateUnreadMarker(page, page, anchor, false), {
    kind: "before",
    messageId: "p",
  });
});

test("已加载窗口里已经有已读消息时不再翻页", () => {
  const anchor = { lastRead: 20n, entryMax: 40n };
  const loaded = [message("old", "20"), message("new", "21"), message("newer", "40")];
  assert.deepEqual(locateUnreadMarker(loaded, loaded, anchor, true), {
    kind: "before",
    messageId: "new",
  });
});

test("进入时滚动到分割线，未读超过一屏也不贴底", () => {
  assert.equal(planUnreadScroll({ dividerTop: 20, scrollHeight: 400, clientHeight: 0 }), null);
  assert.deepEqual(planUnreadScroll({ dividerTop: 320, scrollHeight: 500, clientHeight: 200 }), {
    top: 248,
    follow: false,
  });
  assert.deepEqual(planUnreadScroll({ dividerTop: 250, scrollHeight: 500, clientHeight: 200 }), {
    top: 178,
    follow: false,
  });
  assert.deepEqual(planUnreadScroll({ dividerTop: 40, scrollHeight: 900, clientHeight: 200 }), {
    top: 0,
    follow: false,
  });
});
