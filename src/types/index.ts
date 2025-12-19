export interface Collaborator {
  id: string;
  name: string;
  color: string;
}

export interface RecentNote {
  id: string;
  title: string;
  lastVisited: number;
  ownerId?: string;
  ownerName?: string;
}
