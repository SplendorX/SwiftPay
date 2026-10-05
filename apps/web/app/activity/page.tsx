import { redirect } from "next/navigation";

/** The Activity list is now Transaction History; old links and bookmarks land there. */
export default function Activity() {
  redirect("/transactions");
}
