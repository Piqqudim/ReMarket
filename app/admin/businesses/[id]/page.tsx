"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Edit3,
  ExternalLink,
  MapPin,
  Package,
  Plus,
  Store,
  Users,
  XCircle,
} from "lucide-react";

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  availability: string;
  status: string;
  imageUrl: string | null;
};

type Business = {
  id: string;
  name: string;
  ownerName: string | null;
  description: string | null;
  phone: string | null;
  area: string;
  status: string;
  verification: string;
  availability: string;
  categories: string[];
  products: Product[];
  socialLinks: {
    id: string;
    platform: string;
    handle: string;
  }[];
};

export default function AdminBusinessDetailsPage() {
  const params = useParams();
  const router = useRouter();

  const id = params.id as string;

  const [business, setBusiness] =
    useState<Business | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadBusiness() {
      try {
       const response = await fetch(`/api/admin/businesses/${id}`);

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Unable to load business."
          );
        }

        setBusiness(data);
      } catch (error) {
        console.error(error);

        setError(
          error instanceof Error
            ? error.message
            : "Unable to load business."
        );
      } finally {
        setLoading(false);
      }
    }

    loadBusiness();
  }, [id]);

  if (loading) {
    return (
      <PageShell>
        <div className="flex min-h-[500px] items-center justify-center">
          <div className="text-sm font-semibold text-[#81776F]">
            Loading business...
          </div>
        </div>
      </PageShell>
    );
  }

  if (error || !business) {
    return (
      <PageShell>
        <div className="rounded-2xl border border-[#F1B5A5] bg-[#FFF0ED] p-6 text-sm text-[#9F2D18]">
          {error || "Business not found."}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* Back */}
      <Link
        href="/admin/businesses"
        className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-[#9F2D18] hover:underline"
      >
        <ArrowLeft size={16} />
        Back to Businesses
      </Link>

      {/* Business header */}
      <section className="rounded-2xl border border-[#EAE6DF] bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#FFE0D6] text-[#9F2D18]">
              <Store size={28} />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight">
                  {business.name}
                </h1>

                {business.verification ===
                  "VERIFIED" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#E7F7EE] px-2.5 py-1 text-[11px] font-bold text-[#287A4B]">
                    <CheckCircle2 size={13} />
                    Verified
                  </span>
                )}
              </div>

              {business.ownerName && (
                <p className="mt-1 text-sm text-[#81776F]">
                  Owner: {business.ownerName}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F8F5F0] px-3 py-1 text-xs font-semibold text-[#675D55]">
                  <MapPin size={13} />
                  {business.area}
                </span>

                <StatusBadge
                  label={business.status}
                />

                <StatusBadge
                  label={business.availability}
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Link
              href={`/seller/${business.id}`}
              target="_blank"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E3DED7] bg-white px-3.5 text-sm font-bold text-[#675D55] hover:border-[#FF5A36] hover:text-[#9F2D18]"
            >
              <ExternalLink size={15} />
              View
            </Link>

            <Link
              href={`/admin/businesses/${business.id}/edit`}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#FF5A36] px-4 text-sm font-extrabold text-white hover:bg-[#E94B29]"
            >
              <Edit3 size={15} />
              Edit
            </Link>
          </div>
        </div>

        {business.description && (
          <div className="mt-5 border-t border-[#EAE6DF] pt-5">
            <p className="text-sm leading-6 text-[#675D55]">
              {business.description}
            </p>
          </div>
        )}

        {/* Categories */}
        {business.categories.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {business.categories.map(
              (category) => (
                <span
                  key={category}
                  className="rounded-lg bg-[#FFF0EA] px-2.5 py-1 text-xs font-bold text-[#9F2D18]"
                >
                  {category}
                </span>
              )
            )}
          </div>
        )}
      </section>

      {/* Products */}
      <section className="mt-5 rounded-2xl border border-[#EAE6DF] bg-white p-5 sm:p-6">
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#DDF5EA] text-[#287A4B]">
              <Package size={19} />
            </div>

            <div>
              <h2 className="font-extrabold">
                Products
              </h2>

              <p className="text-xs text-[#8B8178]">
                Products sold by {business.name}
              </p>
            </div>
          </div>

          <Link
            href={`/admin/businesses/${business.id}/products/new`}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 text-sm font-extrabold text-white hover:bg-[#E94B29]"
          >
            <Plus size={16} />
            Add Product
          </Link>
        </div>

        {business.products.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#D8D0C8] px-5 py-10 text-center">
            <Package
              size={30}
              className="mx-auto text-[#B5ACA4]"
            />

            <p className="mt-3 text-sm font-bold text-[#675D55]">
              No products yet
            </p>

            <p className="mt-1 text-xs text-[#9B928A]">
              Add the first product for this
              business.
            </p>

            <Link
              href={`/admin/businesses/${business.id}/products/new`}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#FFF0EA] px-4 py-2.5 text-xs font-extrabold text-[#9F2D18]"
            >
              <Plus size={15} />
              Add Product
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {business.products.map(
              (product) => (
                <div
                  key={product.id}
                  className="rounded-xl border border-[#E8E4DE] bg-[#FCFAF6] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-extrabold">
                        {product.name}
                      </h3>

                      {product.description && (
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#81776F]">
                          {product.description}
                        </p>
                      )}
                    </div>

                    <ProductStatus
                      status={product.status}
                    />
                  </div>

                  <div className="mt-4 flex items-end justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#A49B92]">
                        Price
                      </p>

                      <p className="mt-0.5 text-sm font-black text-[#9F2D18]">
                        {formatPrice(product)}
                      </p>
                    </div>

                    <Link
                      href={`/admin/businesses/${business.id}/products/${product.id}/edit`}
                      className="rounded-lg border border-[#E3DED7] bg-white p-2 text-[#675D55] hover:border-[#FF5A36] hover:text-[#9F2D18]"
                      aria-label={`Edit ${product.name}`}
                    >
                      <Edit3 size={15} />
                    </Link>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </section>

      {/* Contact information */}
      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#EAE6DF] bg-white p-5">
          <h2 className="font-extrabold">
            Contact
          </h2>

          <div className="mt-4 space-y-3">
            {business.phone ? (
              <div className="rounded-xl bg-[#FCFAF6] px-3 py-3 text-sm">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#A49B92]">
                  Phone
                </p>

                <p className="mt-1 font-semibold text-[#4A4039]">
                  {business.phone}
                </p>
              </div>
            ) : (
              <p className="text-sm text-[#9B928A]">
                No phone number added.
              </p>
            )}

            {business.socialLinks.map(
              (link) => (
                <div
                  key={link.id}
                  className="rounded-xl bg-[#FCFAF6] px-3 py-3"
                >
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#A49B92]">
                    {link.platform}
                  </p>

                  <p className="mt-1 text-sm font-semibold text-[#4A4039]">
                    {link.handle}
                  </p>
                </div>
              )
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-[#EAE6DF] bg-white p-5">
          <h2 className="font-extrabold">
            Business summary
          </h2>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <SummaryCard
              label="Products"
              value={business.products.length}
            />

            <SummaryCard
              label="Categories"
              value={business.categories.length}
            />

            <SummaryCard
              label="Verification"
              value={business.verification}
            />

            <SummaryCard
              label="Status"
              value={business.status}
            />
          </div>
        </div>
      </section>
    </PageShell>
  );
}

/* ----------------------------- */
/* Components                    */
/* ----------------------------- */

function PageShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#FFF7ED] text-[#17202A]">
      <div className="mx-auto min-h-screen max-w-[1500px] px-3 py-3 sm:px-4">
        <div className="min-h-[calc(100vh-24px)] overflow-hidden rounded-[22px] border border-[#FF5A36] bg-[#FFFDFC] shadow-[0_10px_40px_rgba(159,45,24,0.08)]">
          <header className="flex h-[66px] items-center justify-between border-b border-[#EAE6DF] bg-white px-4 sm:px-6">
            <Link
              href="/admin"
              className="flex items-center gap-2"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FF5A36] text-white">
                <Store size={19} />
              </div>

              <div>
                <p className="text-[15px] font-extrabold tracking-tight">
                  ReMarket
                </p>
                <p className="text-[10px] font-medium text-[#8B8178]">
                  Admin
                </p>
              </div>
            </Link>

            <span className="rounded-lg bg-[#FFF0EA] px-3 py-1.5 text-xs font-bold text-[#9F2D18]">
              Business Management
            </span>
          </header>

          <div className="flex">
            <aside className="hidden min-h-[calc(100vh-90px)] w-[190px] shrink-0 border-r border-[#EAE6DF] bg-[#FCFAF6] p-3 md:block">
              <nav className="space-y-1">
                <AdminNav
                  href="/admin"
                  label="Overview"
                  icon={<Store size={18} />}
                />

                <AdminNav
                  href="/admin/businesses"
                  label="Businesses"
                  active
                  icon={<Store size={18} />}
                />

                <AdminNav
                  href="/admin/products"
                  label="Products"
                  icon={<Package size={18} />}
                />

                <AdminNav
                  href="/admin/requests"
                  label="Requests"
                  icon={<Users size={18} />}
                />
              </nav>
            </aside>

            <main className="min-w-0 flex-1 p-4 pb-8 sm:p-6">
              {children}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminNav({
  href,
  label,
  icon,
  active = false,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
        active
          ? "bg-[#FFE3DA] text-[#9F2D18]"
          : "text-[#675D55] hover:bg-white hover:text-[#9F2D18]",
      ].join(" ")}
    >
      {icon}
      {label}
    </Link>
  );
}

function StatusBadge({
  label,
}: {
  label: string;
}) {
  return (
    <span className="rounded-full bg-[#F8F5F0] px-2.5 py-1 text-[11px] font-bold text-[#675D55]">
      {label.replaceAll("_", " ")}
    </span>
  );
}

function ProductStatus({
  status,
}: {
  status: string;
}) {
  const active = status === "ACTIVE";

  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold",
        active
          ? "bg-[#E7F7EE] text-[#287A4B]"
          : "bg-[#FFF0ED] text-[#9F2D18]",
      ].join(" ")}
    >
      {active ? (
        <CheckCircle2 size={11} />
      ) : (
        <XCircle size={11} />
      )}

      {status}
    </span>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl bg-[#FCFAF6] p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[#A49B92]">
        {label}
      </p>

      <p className="mt-1 text-sm font-black text-[#4A4039]">
        {value}
      </p>
    </div>
  );
}

function formatPrice(product: Product) {
  if (product.price != null) {
    return `₦${product.price.toLocaleString()}`;
  }

  if (
    product.priceMin != null &&
    product.priceMax != null
  ) {
    return `₦${product.priceMin.toLocaleString()} – ₦${product.priceMax.toLocaleString()}`;
  }

  if (product.priceMin != null) {
    return `From ₦${product.priceMin.toLocaleString()}`;
  }

  if (product.priceMax != null) {
    return `Up to ₦${product.priceMax.toLocaleString()}`;
  }

  return "Price not set";
}