import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen, RotateCcw, Undo2 } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";
import {
  createEducationLibraryBook,
  issueEducationLibraryCopy,
  renewEducationLibraryLoan,
  returnEducationLibraryLoan,
} from "../actions";

const DATA_LIMIT = 1000;
const LOAN_FILTERS = ["all", "overdue", "due_soon", "not_due_soon"] as const;
type LoanFilter = typeof LOAN_FILTERS[number];

function isLoanFilter(value: string): value is LoanFilter {
  return LOAN_FILTERS.includes(value as LoanFilter);
}

export default async function EducationLibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");

  const params = await searchParams;
  const requestedBranch = typeof params.branch === "string" ? params.branch : "";
  const requestedSearch = typeof params.search === "string" ? params.search.trim().slice(0, 100) : "";
  const search = requestedSearch.replace(/[^A-Za-z0-9\s_-]/g, "").trim();
  const requestedLoanFilter = typeof params.loan_status === "string" ? params.loan_status : "";
  const loanFilter: LoanFilter = isLoanFilter(requestedLoanFilter) ? requestedLoanFilter : "all";
  const [canViewCatalog, canCreate, canViewCirculation, canCreateLoan, canEdit, { campuses }] = await Promise.all([
    canTabPermission("education_library", "library", "catalog", "view"),
    canTabPermission("education_library", "library", "catalog", "create"),
    canTabPermission("education_library", "library", "circulation", "view"),
    canTabPermission("education_library", "library", "circulation", "create"),
    canTabPermission("education_library", "library", "circulation", "edit"),
    getAccessibleEducationCampuses(context.orgId, context.userId),
  ]);
  if (!canViewCatalog && !canViewCirculation) {
    redirect("/dashboard?accessDenied=think-education.library");
  }
  const canIssue = canViewCirculation && canCreateLoan
    && await canTabPermission("education_students", "students", "list", "view");
  const campusIds = campuses.map((campus) => campus.id);
  const selectedBranch = campusIds.includes(requestedBranch) ? requestedBranch : "";
  const branchIds = selectedBranch ? [selectedBranch] : campusIds;
  const supabase = await createClient();

  let booksQuery = supabase.from("education_library_books")
      .select("id, branch_id, isbn, title, author, publisher, category, publication_year", { count: "exact" })
      .eq("org_id", context.orgId).in("branch_id", branchIds).eq("status", "active")
      .order("title").range(0, DATA_LIMIT - 1);
  if (search) {
    const pattern = `%${search}%`;
    booksQuery = booksQuery.or(`title.ilike.${pattern},author.ilike.${pattern},isbn.ilike.${pattern},category.ilike.${pattern}`);
  }
  const loadCatalog = canViewCatalog || canIssue;
  const [booksResult, copiesResult, loansResult] = branchIds.length ? await Promise.all([
    loadCatalog ? booksQuery : Promise.resolve({ data: [], count: 0, error: null }),
    loadCatalog
      ? supabase.from("education_library_copies")
        .select("id, branch_id, book_id, copy_number, status", { count: "exact" })
        .eq("org_id", context.orgId).in("branch_id", branchIds)
        .order("copy_number").range(0, DATA_LIMIT - 1)
      : Promise.resolve({ data: [], count: 0, error: null }),
    canViewCirculation
      ? supabase.from("education_library_loans")
        .select("id, branch_id, copy_id, student_id, loaned_on, due_on, renewal_count", { count: "exact" })
        .eq("org_id", context.orgId).in("branch_id", branchIds).is("returned_on", null)
        .order("due_on").limit(DATA_LIMIT)
      : Promise.resolve({ data: [], count: 0, error: null }),
  ]) : [
    { data: [], count: 0, error: null },
    { data: [], count: 0, error: null },
    { data: [], count: 0, error: null },
  ];

  if (booksResult.error) throw new Error(`Could not load Think Education library catalog: ${booksResult.error.message}`);
  if (copiesResult.error) throw new Error(`Could not load Think Education library copies: ${copiesResult.error.message}`);
  if (loansResult.error) throw new Error(`Could not load Think Education library loans: ${loansResult.error.message}`);
  if ((booksResult.count ?? 0) > DATA_LIMIT || (copiesResult.count ?? 0) > DATA_LIMIT
    || (loansResult.count ?? 0) > DATA_LIMIT) {
    throw new Error("The library contains more than 1,000 records for this view. Filter to one campus to load the results.");
  }

  const books = booksResult.data ?? [];
  const copies = copiesResult.data ?? [];
  const loans = loansResult.data ?? [];
  const loanStudentIds = [...new Set(loans.map((loan) => loan.student_id))];
  const { data: students, error: studentsError } = loanStudentIds.length
    ? await supabase.from("education_students").select("id, student_number, first_name, last_name")
      .eq("org_id", context.orgId).in("id", loanStudentIds)
    : { data: [], error: null };
  if (studentsError) throw new Error(`Could not load library borrower names: ${studentsError.message}`);

  const bookById = new Map(books.map((book) => [book.id, book]));
  const copyById = new Map(copies.map((copy) => [copy.id, copy]));
  const studentById = new Map((students ?? []).map((student) => [student.id, student]));
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const copyCountByBook = new Map<string, number>();
  const availableCountByBook = new Map<string, number>();
  const openCopyIds = new Set(loans.map((loan) => loan.copy_id));
  for (const copy of copies) {
    copyCountByBook.set(copy.book_id, (copyCountByBook.get(copy.book_id) ?? 0) + 1);
    if (copy.status === "available" && !openCopyIds.has(copy.id)) {
      availableCountByBook.set(copy.book_id, (availableCountByBook.get(copy.book_id) ?? 0) + 1);
    }
  }
  const availableCopies = copies.filter((copy) => copy.status === "available" && !openCopyIds.has(copy.id));
  const today = new Date().toISOString().slice(0, 10);
  const dueSoonThrough = new Date(`${today}T00:00:00.000Z`);
  dueSoonThrough.setUTCDate(dueSoonThrough.getUTCDate() + 7);
  const dueSoonThroughText = dueSoonThrough.toISOString().slice(0, 10);
  const visibleLoans = loans.filter((loan) => {
    if (loanFilter === "overdue") return loan.due_on < today;
    if (loanFilter === "due_soon") return loan.due_on >= today && loan.due_on <= dueSoonThroughText;
    if (loanFilter === "not_due_soon") return loan.due_on > dueSoonThroughText;
    return true;
  });
  const overdueLoanCount = loans.filter((loan) => loan.due_on < today).length;
  const csvRows = [
    ["Student", "Campus", "Book", "Copy", "Loaned on", "Due on", "Renewals", "Status"],
    ...visibleLoans.map((loan) => {
      const student = studentById.get(loan.student_id);
      const copy = copyById.get(loan.copy_id);
      const book = copy ? bookById.get(copy.book_id) : null;
      const status = loan.due_on < today ? "Overdue" : loan.due_on <= dueSoonThroughText ? "Due soon" : "Due later";
      return [
        student ? `${student.first_name} ${student.last_name} (${student.student_number})` : "Unknown student",
        campusNameById.get(loan.branch_id) ?? loan.branch_id,
        book?.title ?? "Unknown book",
        copy?.copy_number ?? "",
        loan.loaned_on,
        loan.due_on,
        String(loan.renewal_count),
        status,
      ];
    }),
  ];
  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(csvRows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"))}`;

  const errorMessage = params.error === "invalid"
    ? "Enter valid book details, campus, and copy count."
    : params.error === "duplicate"
      ? "A book with this ISBN already exists at the selected campus."
      : params.error === "student"
        ? "No active student was found with that student number at the selected campus."
        : params.error === "loan-limit"
          ? "This student has five active loans or an overdue book."
          : params.error === "unavailable"
            ? "That copy is no longer available. Refresh the page and try again."
            : params.error === "transition"
              ? "This loan is already returned, overdue, or has already been renewed."
              : params.error === "not-found"
                ? "The library loan could not be found."
                : params.error === "save"
                  ? "The library update could not be saved. Please try again."
                  : null;

  return <main className="mx-auto max-w-[1400px] space-y-5 p-4 md:p-6">
    <header>
      <Link href={getProductAppPath("think-education", "/dashboard")} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-950">Library</h1>
      <p className="mt-1 text-sm text-slate-600">Manage campus book catalogs, physical copies, active loans, renewals, and returns.</p>
    </header>

    {params.created === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Book and copies added to the catalog.</p>}
    {params.issued === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Book issued. It is due in 14 days.</p>}
    {params.renewed === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Loan renewed for 14 days.</p>}
    {params.returned === "1" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Book return recorded.</p>}
    {params.error && errorMessage && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{errorMessage}</p>}

    <form method="get" action={getProductAppPath("think-education", "/library")} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <label className="min-w-[220px] flex-1 text-sm font-medium text-slate-700">Search
        <input name="search" defaultValue={requestedSearch} placeholder="Title, author, ISBN, category" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
      </label>
      <label className="min-w-60 text-sm font-medium text-slate-700">Campus
        <select name="branch" defaultValue={selectedBranch} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="">All assigned campuses</option>
          {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
        </select>
      </label>
      {canViewCirculation && <label className="min-w-52 text-sm font-medium text-slate-700">Active loan due status
        <select name="loan_status" defaultValue={loanFilter} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
          <option value="all">All active loans</option>
          <option value="overdue">Overdue</option>
          <option value="due_soon">Due within 7 days</option>
          <option value="not_due_soon">Due later</option>
        </select>
      </label>}
      <button type="submit" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">Apply filters</button>
      {visibleLoans.length > 0 && <a href={csvHref} download={`education-library-loans-${new Date().toISOString().slice(0, 10)}.csv`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Export CSV</a>}
    </form>

    {canViewCatalog && canCreate && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-950">Add a book to the catalog</h2>
      {!campuses.length ? <p className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">You need an assigned Think Education campus before managing library books.</p> : <form action={createEducationLibraryBook} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium text-slate-700">Campus
          <select required name="branch_id" defaultValue={selectedBranch || campuses[0]?.id || ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Title
          <input required name="title" maxLength={200} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Author
          <input required name="author" maxLength={160} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Category
          <input required name="category" maxLength={80} placeholder="Fiction, science, history..." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">ISBN (optional)
          <input name="isbn" maxLength={32} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Publisher (optional)
          <input name="publisher" maxLength={160} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Publication year
          <input name="publication_year" type="number" min="1000" max="9999" step="1" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="text-sm font-medium text-slate-700">Number of copies
          <input required name="copy_count" type="number" min="1" max="500" step="1" defaultValue="1" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <div className="sm:col-span-2 lg:col-span-4">
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Add book and copies</button>
        </div>
      </form>}
    </section>}

    {canIssue && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-950">Issue a book</h2>
      <p className="mt-1 text-sm text-slate-500">Loans are due in 14 days. Students can hold up to five books and cannot borrow while overdue.</p>
      <form action={issueEducationLibraryCopy} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm font-medium text-slate-700">Available copy
          <select required name="copy_ref" defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
            <option value="" disabled>Select a campus copy</option>
            {availableCopies.map((copy) => {
              const book = bookById.get(copy.book_id);
              return <option key={copy.id} value={`${copy.branch_id}.${copy.id}`}>
                {campusNameById.get(copy.branch_id)} · {book?.title ?? "Book"} · {copy.copy_number}
              </option>;
            })}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Student number
          <input required name="student_number" maxLength={80} autoComplete="off" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <div className="flex items-end">
          <button disabled={!availableCopies.length} type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white enabled:hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">Issue for 14 days</button>
        </div>
      </form>
      {!availableCopies.length && <p className="mt-3 text-sm text-slate-500">There are no available copies in the selected campuses.</p>}
    </section>}

    {canViewCatalog && <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <form method="get" action={getProductAppPath("think-education", "/library")} className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4">
        {selectedBranch && <input type="hidden" name="branch" value={selectedBranch} />}
        {canViewCirculation && <input type="hidden" name="loan_status" value={loanFilter} />}
        <label className="min-w-60 flex-1 text-sm font-medium text-slate-700">Search catalog
          <input name="search" defaultValue={search} maxLength={100} placeholder="Title, author, ISBN, or category" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <button type="submit" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100">Search</button>
      </form>
      <div className="flex items-center gap-2 border-b border-slate-100 p-4">
        <BookOpen className="h-5 w-5 text-blue-700" />
        <h2 className="font-semibold text-slate-950">Catalog</h2>
        <span className="text-sm text-slate-500">{books.length} titles</span>
      </div>
      {books.length ? <div className="divide-y divide-slate-100">
        {books.map((book) => {
          return <article key={book.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div>
              <h3 className="font-semibold text-slate-950">{book.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{book.author} · {book.category}{book.publication_year ? ` · ${book.publication_year}` : ""}</p>
              <p className="mt-1 text-xs text-slate-500">{campusNameById.get(book.branch_id)}{book.isbn ? ` · ISBN ${book.isbn}` : ""}{book.publisher ? ` · ${book.publisher}` : ""}</p>
            </div>
            <p className="text-sm font-medium text-slate-700">{copyCountByBook.get(book.id) ?? 0} copies · {availableCountByBook.get(book.id) ?? 0} available</p>
          </article>;
        })}
      </div> : <p className="p-6 text-center text-sm text-slate-500">No books have been added to the catalog yet.</p>}
    </section>}

    {canViewCirculation && <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-4">
        <h2 className="font-semibold text-slate-950">Active loans <span className="font-normal text-slate-500">({visibleLoans.length.toLocaleString()} shown)</span></h2>
        <p className="mt-1 text-sm text-slate-500">{overdueLoanCount.toLocaleString()} overdue across the selected campuses. A loan may be renewed once before its due date.</p>
      </div>
      {visibleLoans.length ? <div className="divide-y divide-slate-100">
        {visibleLoans.map((loan) => {
          const copy = copyById.get(loan.copy_id);
          const book = copy ? bookById.get(copy.book_id) : null;
          const student = studentById.get(loan.student_id);
          const overdue = loan.due_on < new Date().toISOString().slice(0, 10);
          return <article key={loan.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div>
              <p className="font-semibold text-slate-950">{book?.title ?? "Book"} · {copy?.copy_number ?? "Copy"}</p>
              <p className="mt-1 text-sm text-slate-600">{student ? `${student.first_name} ${student.last_name} · ${student.student_number}` : "Student"} · {campusNameById.get(loan.branch_id)}</p>
              <p className={`mt-1 text-sm ${overdue ? "font-semibold text-red-700" : "text-slate-500"}`}>
                Issued {loan.loaned_on} · {overdue ? `Overdue since ${loan.due_on}` : `Due ${loan.due_on}`}
                {loan.renewal_count ? " · Renewed" : ""}
              </p>
            </div>
            {canEdit && <div className="flex flex-wrap gap-2">
              {!loan.renewal_count && !overdue && <form action={renewEducationLibraryLoan}>
                <input type="hidden" name="loan_id" value={loan.id} />
                <button type="submit" className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-50"><RotateCcw className="h-4 w-4" /> Renew</button>
              </form>}
              <form action={returnEducationLibraryLoan}>
                <input type="hidden" name="loan_id" value={loan.id} />
                <button type="submit" className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-900"><Undo2 className="h-4 w-4" /> Return</button>
              </form>
            </div>}
          </article>;
        })}
      </div> : <p className="p-6 text-center text-sm text-slate-500">{loans.length ? "No active loans match this due-status filter." : "There are no active loans in the selected campuses."}</p>}
    </section>}
  </main>;
}
