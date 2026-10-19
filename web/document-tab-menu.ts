/**
 * 文档库页签右键菜单项：开始页签、文档页签、HTML 阅览页签各有适用动作。
 * 依赖父组件的状态与回调，统一由 ctx 传入。
 */
import type { Dispatch, SetStateAction } from "react";
import type { TabMenuItem } from "./document-context-menus";
import { START_TAB_ID, type BrowserTab } from "./document-view-internals";

export type DocumentTabMenuContext = {
  treeOpen: boolean;
  setTreeOpen: Dispatch<SetStateAction<boolean>>;
  openDocumentTree: () => void;
  hasContentTabs: boolean;
  openTabs: string[];
  setOpenTabs: Dispatch<SetStateAction<string[]>>;
  browserTabs: BrowserTab[];
  setBrowserTabs: Dispatch<SetStateAction<BrowserTab[]>>;
  browserSelected: string;
  setBrowserSelected: Dispatch<SetStateAction<string>>;
  setPreviewReload: Dispatch<SetStateAction<number>>;
  selected: string;
  onSelect: (id: string) => void;
  onRefresh: () => Promise<void>;
  onReference: ((id: string) => void) | undefined;
  createBrowserNewTab: () => void;
  closeStartTab: () => void;
  selectBrowserTab: (key: string) => void;
  copyBrowserTabAddress: (tab: BrowserTab) => Promise<void>;
  closeBrowserTab: (key: string) => void;
  closeOtherBrowserTabs: (key: string) => void;
  closeBrowserTabsDirection: (key: string, side: "left" | "right") => void;
  closeTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  closeTabsDirection: (id: string, side: "left" | "right") => void;
};

export function buildDocumentTabMenuItems(id: string, ctx: DocumentTabMenuContext): TabMenuItem[] {
  const {
    treeOpen,
    setTreeOpen,
    openDocumentTree,
    hasContentTabs,
    openTabs,
    browserTabs,
    browserSelected,
    setPreviewReload,
    selected,
    onSelect,
    onRefresh,
    onReference,
    createBrowserNewTab,
    closeStartTab,
    selectBrowserTab,
    copyBrowserTabAddress,
    closeBrowserTab,
    closeOtherBrowserTabs,
    closeBrowserTabsDirection,
    closeTab,
    closeOtherTabs,
    closeTabsDirection,
  } = ctx;
  if (id === START_TAB_ID) {
    return [
      {
        key: "tree",
        label: treeOpen ? "隐藏文件树" : "打开文件树",
        icon: "folder",
        onRun: () => (treeOpen ? setTreeOpen(false) : openDocumentTree()),
      },
      {
        key: "new-html",
        label: "打开新HTML阅览页",
        icon: "newFile",
        onRun: createBrowserNewTab,
      },
      {
        key: "close",
        label: "关闭开始页签",
        icon: "closeFile",
        separatorBefore: true,
        disabled: !hasContentTabs,
        disabledTitle: "没有其它页签时开始页签不可关闭",
        onRun: closeStartTab,
      },
    ];
  }
  const browserIndex = browserTabs.findIndex((tab) => tab.key === id);
  if (browserIndex >= 0) {
    const tab = browserTabs[browserIndex];
    const hasPage = Boolean(tab.versionId);
    const noPageTitle = "该阅览页还没打开页面";
    return [
      {
        key: "reload",
        label: "刷新",
        icon: "refresh",
        disabled: !hasPage,
        disabledTitle: noPageTitle,
        onRun: () => {
          if (browserSelected !== tab.key) selectBrowserTab(tab.key);
          setPreviewReload((value) => value + 1);
        },
      },
      {
        key: "external",
        label: "在电脑浏览器中打开",
        icon: "share",
        disabled: !hasPage,
        disabledTitle: noPageTitle,
        onRun: () => {
          window.open(
            tab.loadUrl || `/api/versions/${tab.versionId}/preview/`,
            "_blank",
            "noopener,noreferrer",
          );
        },
      },
      {
        key: "copy",
        label: "复制地址",
        icon: "copy",
        disabled: !hasPage,
        disabledTitle: noPageTitle,
        onRun: () => void copyBrowserTabAddress(tab),
      },
      {
        key: "close",
        label: "关闭阅览页",
        icon: "closeFile",
        separatorBefore: true,
        onRun: () => closeBrowserTab(tab.key),
      },
      {
        key: "close-others",
        label: "关闭其它阅览页",
        icon: "closeOthers",
        disabled: browserTabs.length <= 1,
        onRun: () => closeOtherBrowserTabs(tab.key),
      },
      {
        key: "close-right",
        label: "关闭右侧阅览页",
        icon: "closeRight",
        disabled: browserIndex >= browserTabs.length - 1,
        onRun: () => closeBrowserTabsDirection(tab.key, "right"),
      },
      {
        key: "close-left",
        label: "关闭左侧阅览页",
        icon: "closeLeft",
        disabled: browserIndex === 0,
        onRun: () => closeBrowserTabsDirection(tab.key, "left"),
      },
    ];
  }
  const index = openTabs.indexOf(id);
  if (index < 0) return [];
  return [
    {
      key: "reload",
      label: "刷新",
      icon: "refresh",
      onRun: () => {
        if (id !== selected) onSelect(id);
        setPreviewReload((value) => value + 1);
        void onRefresh();
      },
    },
    {
      key: "download",
      label: "下载",
      icon: "download",
      onRun: () => {
        window.open(`/api/versions/${id}/download`, "_blank", "noopener,noreferrer");
      },
    },
    {
      key: "add-to-chat",
      label: "添加到对话",
      icon: "addToChat",
      disabled: !onReference,
      disabledTitle: "当前迭代不可添加到对话",
      onRun: () => onReference?.(id),
    },
    {
      key: "close",
      label: "关闭文件",
      icon: "closeFile",
      separatorBefore: true,
      onRun: () => closeTab(id),
    },
    {
      key: "close-others",
      label: "关闭其它文件",
      icon: "closeOthers",
      disabled: openTabs.length <= 1,
      onRun: () => closeOtherTabs(id),
    },
    {
      key: "close-right",
      label: "关闭右侧文件",
      icon: "closeRight",
      disabled: index >= openTabs.length - 1,
      onRun: () => closeTabsDirection(id, "right"),
    },
    {
      key: "close-left",
      label: "关闭左侧文件",
      icon: "closeLeft",
      disabled: index === 0,
      onRun: () => closeTabsDirection(id, "left"),
    },
  ];
}
