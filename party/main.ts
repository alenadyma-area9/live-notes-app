import type * as Party from "partykit/server";

// Dummy main entry point (required by PartyKit)
export default class MainServer implements Party.Server {
  constructor(readonly room: Party.Room) {}
}
