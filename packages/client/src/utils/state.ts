import { AccountManager, ButtonManager } from "../manager";
import { AccountViewProvider, IPC } from ".";
import {
  FM_KEY,
  LYRIC_KEY,
  PLAYER_MODE,
  QUEUE_INIT,
  REPEAT_KEY,
  SHOW_LYRIC_KEY,
} from "../constant";
import { QueueItemTreeItem, QueueProvider } from "../treeview";
import type { ExtensionContext } from "vscode";
import type { NeteaseTypings } from "api";
import type { QueueContent } from "../treeview";
import i18n from "../i18n";

export const enum LyricType {
  ori = 0, // original
  tra = -1, // translation
}

type Lyric = {
  type: LyricType;
  updatePanel?: (text: NeteaseTypings.LyricData["text"]) => void;
  updateIndex?: (idx: number) => void;
} & NeteaseTypings.LyricData;

export const defaultLyric: Lyric = {
  type: LyricType.ori,
  time: [0],
  text: [["~"]],
  user: [],
};

export class State {
  static context: ExtensionContext;

  static wasm = PLAYER_MODE === "wasm";

  private static _first = false;

  private static _master = false;

  private static _repeat = false;

  private static _playItem?: QueueContent;

  private static _like = false;

  private static _fm = false;

  private static _showLyric = false;

  private static _lyric: Lyric = defaultLyric;

  static get master(): boolean {
    return this._master;
  }

  static get repeat(): boolean {
    return this._repeat;
  }

  static get playItem(): QueueContent | undefined {
    return this._playItem;
  }

  static get like(): boolean {
    return this._like;
  }

  static get fm(): boolean {
    return this._fm;
  }

  static get showLyric(): boolean {
    return this._showLyric;
  }

  static get lyric(): Lyric {
    return this._lyric;
  }

  static set first(value: boolean) {
    // After account is initialized, the first time to load the queue
    if (!value) {
      const { head } = QueueProvider;
      // From `set playItem`
      this._playItem = head;
      this.like = !!(head && head instanceof QueueItemTreeItem);
      AccountViewProvider.metadata();

      this.loading = false;
      this.context.subscriptions.push(
        // Prevent first loading [#507](https://github.com/YXL76/cloudmusic-vscode/issues/507)
        QueueProvider.getInstance().onDidChangeTreeData(() => {
          this.fm = false;
          this.playItem = QueueProvider.head;
        })
      );
    }

    if (this._first !== value) {
      this._first = value;
      if (value) return;
      switch (QUEUE_INIT) {
        case "none":
          break;
        case "restore":
          IPC.retain();
          break;
        case "recommend":
          if (AccountManager.accounts.size) {
            const [[uid]] = AccountManager.accounts;
            void IPC.netease("recommendSongs", [uid]).then((songs) => {
              const items = songs.map(
                (song) =>
                  QueueItemTreeItem.new({ ...song, pid: song.al.id }).data
              );
              IPC.new(items);
            });
          }
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/adjacent-overload-signatures
  static set master(value: boolean) {
    if (this._master !== value) {
      this._master = value;
      AccountViewProvider.master();
      if (this._master) IPC.pid();
    }
  }

  // eslint-disable-next-line @typescript-eslint/adjacent-overload-signatures
  static set repeat(value: boolean) {
    this._repeat = value;
    ButtonManager.buttonRepeat(value);
    void this.context.globalState.update(REPEAT_KEY, value);
  }

  // eslint-disable-next-line @typescript-eslint/adjacent-overload-signatures
  static set playItem(value: QueueContent | undefined) {
    if (value !== this._playItem) {
      this._playItem = value;
      this.like = !!(value && value instanceof QueueItemTreeItem);
      AccountViewProvider.metadata();
      if (this._master) value ? IPC.load() : IPC.stop();
    }
  }

  // eslint-disable-next-line @typescript-eslint/adjacent-overload-signatures
  static set like(newValue: boolean) {
    if (newValue !== this._like) {
      this._like = newValue;
      ButtonManager.buttonLike();
    }
  }

  static set loading(value: boolean) {
    // if (value === this._loading) return;
    if (value)
      ButtonManager.buttonSong(
        `$(loading~spin) ${i18n.word.song}: ${i18n.word.loading}`
      );
    else if (this._playItem)
      ButtonManager.buttonSong(
        this._playItem.item.name,
        this._playItem.tooltip,
        this._playItem.item.al.picUrl,
        this._playItem.item.al.name
      );
  }

  // eslint-disable-next-line @typescript-eslint/adjacent-overload-signatures
  static set fm(value: boolean) {
    this._fm = value;
    ButtonManager.buttonPrevious(value);
    if (value && this._master) IPC.fmNext();
    void this.context.globalState.update(FM_KEY, value);
  }

  // eslint-disable-next-line @typescript-eslint/adjacent-overload-signatures
  static set showLyric(value: boolean) {
    this._showLyric = value;
    void this.context.globalState.update(SHOW_LYRIC_KEY, value);
  }

  // eslint-disable-next-line @typescript-eslint/adjacent-overload-signatures
  static set lyric(value: Lyric) {
    this._lyric = value;
    ButtonManager.buttonLyric();
    void this.context.globalState.update(LYRIC_KEY, value);
    value.updatePanel?.(value.text);
  }

  static init(): void {
    this.repeat = this.context.globalState.get(REPEAT_KEY, false);
    // 需要在 IPC 连接后及登录帐号后修改
    this.fm = this.context.globalState.get(FM_KEY, false);
    this._showLyric = this.context.globalState.get(SHOW_LYRIC_KEY, false);
    this._lyric = this.context.globalState.get(LYRIC_KEY, defaultLyric);
  }
}
