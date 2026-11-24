import { NextResponse, type NextRequest } from "next/server";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const context = await getCurrentOrgContext();
  if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  if (!await canTabPermission("education_library", "library", "circulation", "create")
    || !await canTabPermission("education_students", "students", "list", "view")) {
    return NextResponse.json({ error: "You do not have permission to issue library books." }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const requestedBranch = params.get("branch") ?? "";
  const search = (params.get("search") ?? "").trim().slice(0, 100);
  const safeSearch = search.replace(/[^A-Za-z0-9\s_-]/g, "");
  if (safeSearch.length < 2) {
    return NextResponse.json({ copies: [] }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  if (requestedBranch && !campusIds.includes(requestedBranch)) {
    return NextResponse.json({ error: "The selected campus is outside your access scope." }, { status: 403 });
  }
  const branchIds = requestedBranch ? [requestedBranch] : campusIds;
  if (!branchIds.length) return NextResponse.json({ copies: [] });

  const supabase = await createClient();
  const pattern = `%${safeSearch}%`;
  const { data: books, error: booksError } = await supabase.from("education_library_books")
    .select("id, branch_id, title")
    .eq("org_id", context.orgId).in("branch_id", branchIds).eq("status", "active")
    .or(`title.ilike.${pattern},author.ilike.${pattern},isbn.ilike.${pattern},category.ilike.${pattern}`)
    .order("title").order("id").limit(50);
  if (booksError) {
    console.error("Could not search Think Education library books for issuing:", booksError.message);
    return NextResponse.json({ error: "Could not search available library copies." }, { status: 500 });
  }
  const bookIds = (books ?? []).map((book) => book.id);
  if (!bookIds.length) return NextResponse.json({ copies: [] }, { headers: { "Cache-Control": "private, no-store" } });

  const availableCopies = [];
  for (let offset = 0; offset <= 10_000 && availableCopies.length < 50; offset += 250) {
    const { data: candidateCopies, error: copiesError } = await supabase.from("education_library_copies")
      .select("id, branch_id, book_id, copy_number")
      .eq("org_id", context.orgId).in("branch_id", branchIds).in("book_id", bookIds).eq("status", "available")
      .order("copy_number").order("id").range(offset, offset + 249);
    if (copiesError) {
      console.error("Could not load matching Think Education library copies:", copiesError.message);
      return NextResponse.json({ error: "Could not search available library copies." }, { status: 500 });
    }
    if (!candidateCopies?.length) break;
    const copyIds = candidateCopies.map((copy) => copy.id);
    const { data: openLoans, error: loansError } = await supabase.from("education_library_loans").select("copy_id")
      .eq("org_id", context.orgId).in("copy_id", copyIds).is("returned_on", null);
    if (loansError) {
      console.error("Could not verify available Think Education library copies:", loansError.message);
      return NextResponse.json({ error: "Could not verify available library copies." }, { status: 500 });
    }
    const openCopyIds = new Set((openLoans ?? []).map((loan) => loan.copy_id));
    availableCopies.push(...candidateCopies.filter((copy) => !openCopyIds.has(copy.id)));
    if (candidateCopies.length < 250) break;
    if (offset === 10_000 && availableCopies.length < 50) {
      return NextResponse.json({ error: "Narrow your search to find available copies." }, { status: 422 });
    }
  }

  const bookById = new Map((books ?? []).map((book) => [book.id, book]));
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const result = availableCopies.slice(0, 50).map((copy) => ({
    value: `${copy.branch_id}.${copy.id}`,
    label: `${campusNameById.get(copy.branch_id) ?? "Campus"} · ${bookById.get(copy.book_id)?.title ?? "Book"} · ${copy.copy_number}`,
  }));
  return NextResponse.json({ copies: result }, { headers: { "Cache-Control": "private, no-store" } });
}
