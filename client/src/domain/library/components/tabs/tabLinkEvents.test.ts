import { expect, it, vi } from "vitest";
import type { MouseEvent } from "react";
import {
  openReaderLink,
  openSavedLink,
} from "@/domain/library/components/tabs/tabLinkEvents";
import type { TabListItem } from "@/domain/library/components/tabs/TabList";

const tab = { id: "saved" } as TabListItem;

it("routes primary and middle clicks through the saved-tab opener", () => {
  const onOpen = vi.fn();
  const primary = {
    type: "click",
    button: 0,
    preventDefault: vi.fn(),
  } as unknown as MouseEvent<HTMLElement>;
  const middle = {
    type: "auxclick",
    button: 1,
    preventDefault: vi.fn(),
  } as unknown as MouseEvent<HTMLElement>;
  const right = {
    type: "auxclick",
    button: 2,
    preventDefault: vi.fn(),
  } as unknown as MouseEvent<HTMLElement>;

  openSavedLink(primary, tab, onOpen);
  openSavedLink(middle, tab, onOpen);
  openSavedLink(right, tab, onOpen);

  expect(onOpen).toHaveBeenCalledTimes(2);
  expect(primary.preventDefault).toHaveBeenCalledOnce();
  expect(middle.preventDefault).toHaveBeenCalledOnce();
  expect(right.preventDefault).not.toHaveBeenCalled();
});

it("resolves relative reader links against the article URL", () => {
  const onOpen = vi.fn();
  const event = {
    type: "click",
    button: 0,
    preventDefault: vi.fn(),
    target: {
      closest: () => ({ getAttribute: () => "../next" }),
    },
  } as unknown as MouseEvent<HTMLDivElement>;

  openReaderLink(event, tab, onOpen, "https://example.com/articles/current");

  expect(onOpen).toHaveBeenCalledWith(tab, "https://example.com/next");
  expect(event.preventDefault).toHaveBeenCalledOnce();
});
