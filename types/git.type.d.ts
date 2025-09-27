export type GhMeta = {
  name: string;
  path: string;
  sha: string;
  url: string;
  git_url: string;
  html_url: string;
  repository: GhRepo;
  score: number;
};

type GhRepo = {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  private: boolean;
  owner: GhRepoOwner;
};

type GhRepoOwner = {
  login: string;
  id: number;
  node_id: string;
};

type GhUrl = {
  sha: string;
  node_id: string;
  size: number;
  url: string;
  content: string;
  encoding: string;
};
