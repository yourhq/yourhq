export interface BrowserTab {
  id: string;
  url: string;
  title: string;
}

export interface BrowserState {
  url: string | null;
  title: string | null;
  tabs: BrowserTab[];
}
