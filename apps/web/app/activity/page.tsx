import { redirect } from "next/navigation";

/** Activity is now Insights; old links and bookmarks land there. */
export default function Activity() {
  redirect("/insights");
}
