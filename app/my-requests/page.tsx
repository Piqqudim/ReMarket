"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Home,
  ShoppingBag,
  ClipboardList,
  Heart,
  Plus,
  ArrowLeft,
  MapPin,
  ImagePlus,
  CheckCircle2,
  Loader2,
  Search,
} from "lucide-react";

const NAV_ITEMS = [
  {
    label: "Home",
    href: "/",
    icon: Home,
  },
  {
    label: "Shop",
    href: "/shop",
    icon: ShoppingBag,
  },
  {
    label: "Requests",
    href: "/my-requests",
    icon: ClipboardList,
  },
  {
    label: "Saved",
    href: "/saved",
    icon: Heart,
  },
];

const CATEGORIES = [
  "Fashion",
  "Electronics",
  "Food",
  "Beauty",
  "Textiles",
  "Services",
];

type CreatedRequest = {
  id: string;
  requestCode: string;
  query: string;
  status: string;
  matches?: Array<{
    id: string;
    score: number;
    business: {
      id: string;
      name: string;
      verification: string;
    };
  }>;
};

export default function RequestPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [budget, setBudget] = useState("");
  const [locationArea, setLocationArea] = useState("");
  const [quantity, setQuantity] = useState("");
  const [description, setDescription] = useState("");
  const [buyerContact, setBuyerContact] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [error, setError] = useState("");

  const [createdRequest, setCreatedRequest] =
    useState<CreatedRequest | null>(null);

  async function handleImageUpload(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      setUploading(true);
      setError("");

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to upload image"
        );
      }

      setImageUrl(data.url);
    } catch (error) {
      console.error("Image upload error:", error);

      setError(
        error instanceof Error
          ? error.message
          : "Unable to upload image"
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(
    event: React.SubmitEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!query.trim()) {
      setError("Tell us what you're looking for.");
      return;
    }

    if (!buyerContact.trim()) {
      setError(
        "Add a WhatsApp or phone number so sellers can reach you."
      );
      return;
    }

    try {
      setLoading(true);
      setError("");
      setCreatedRequest(null);

      const response = await fetch("/api/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: query.trim(),

          category:
            category || undefined,

          budget: budget
            ? Number(budget)
            : undefined,

          locationArea:
            locationArea.trim() || undefined,

          quantity: quantity
            ? Number(quantity)
            : undefined,

          description:
            description.trim() || undefined,

          imageUrl:
            imageUrl || undefined,

          buyerContact:
            buyerContact.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to create request"
        );
      }

      setCreatedRequest(data.request);

      setQuery("");
      setCategory("");
      setBudget("");
      setLocationArea("");
      setQuantity("");
      setDescription("");
      setBuyerContact("");
      setImageUrl("");
    } catch (error) {
      console.error(
        "Create request error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Unable to create your request"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#FFF7ED] p-0 md:p-4">
      <div
        className="
          mx-auto
          min-h-screen
          max-w-[1500px]
          overflow-hidden
          bg-[#FFFDFC]
          shadow-none

          md:min-h-[calc(100vh-32px)]
          md:rounded-[22px]
          md:border
          md:border-[#FF5A36]
          md:shadow-[0_12px_40px_rgba(159,45,24,0.08)]
        "
      >
        {/* Header */}
        <header
          className="
            flex
            h-[66px]
            items-center
            justify-between
            border-b
            border-[#EAE6DF]
            bg-white
            px-4
            md:px-6
          "
        >
          <Link
            href="/"
            className="flex items-center gap-2"
          >
            <div
              className="
                flex
                h-9
                w-9
                items-center
                justify-center
                rounded-[11px]
                bg-[#FF5A36]
                text-white
              "
            >
              <Search size={19} />
            </div>

            <div className="leading-none">
              <div className="text-[17px] font-extrabold tracking-tight text-[#17202A]">
                ReMarket
              </div>

              <div className="mt-1 text-[10px] font-medium text-[#8A847D]">
                Find it nearby
              </div>
            </div>
          </Link>

          <Link
            href="/my-requests"
            className="
              hidden
              items-center
              gap-2
              rounded-[11px]
              border
              border-[#EAE6DF]
              bg-white
              px-3
              py-2
              text-[12px]
              font-bold
              text-[#55504A]
              transition
              hover:border-[#FFB39F]
              hover:bg-[#FFF7ED]
              md:flex
            "
          >
            <ClipboardList size={15} />
            My Requests
          </Link>
        </header>

        <div className="flex min-h-[calc(100vh-66px)]">
          {/* Sidebar */}
          <aside
            className="
              hidden
              w-[190px]
              shrink-0
              border-r
              border-[#EAE6DF]
              bg-[#FCFAF6]
              px-3
              py-4
              md:block
            "
          >
            <nav className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="
                      flex
                      items-center
                      gap-3
                      rounded-[11px]
                      px-3
                      py-2.5
                      text-[12px]
                      font-semibold
                      text-[#6F6A64]
                      transition
                      hover:bg-[#F3EEE7]
                      hover:text-[#292622]
                    "
                  >
                    <Icon size={17} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-6 rounded-[14px] bg-[#FFF0D9] p-3">
              <p className="text-[12px] font-bold text-[#7E321F]">
                Looking for something?
              </p>

              <p className="mt-1 text-[11px] leading-4 text-[#91644F]">
                Tell us what you need and we'll
                look for nearby sellers.
              </p>
            </div>
          </aside>

          {/* Main */}
          <section className="min-w-0 flex-1 px-4 py-5 pb-24 md:px-6 md:py-6 md:pb-6">
            <div className="mx-auto max-w-[850px]">
              {/* Back */}
              <Link
                href="/"
                className="
                  inline-flex
                  items-center
                  gap-1.5
                  text-[12px]
                  font-semibold
                  text-[#77716A]
                  hover:text-[#FF5A36]
                "
              >
                <ArrowLeft size={14} />
                Back to ReMarket
              </Link>

              {/* Heading */}
              <div className="mt-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#FF5A36]">
                  Find it nearby
                </p>

                <h1 className="mt-1 text-[27px] font-extrabold tracking-tight text-[#17202A]">
                  Request something
                </h1>

                <p className="mt-1 max-w-[620px] text-[13px] leading-5 text-[#77716A]">
                  Can't find what you're looking
                  for? Tell us what you need and
                  we'll look for sellers around you.
                </p>
              </div>

              {/* Success */}
              {createdRequest ? (
                <div
                  className="
                    mt-6
                    rounded-[20px]
                    border
                    border-[#BDE6CE]
                    bg-[#F0FBF4]
                    p-6
                  "
                >
                  <div
                    className="
                      flex
                      h-12
                      w-12
                      items-center
                      justify-center
                      rounded-full
                      bg-[#DDF5EA]
                      text-[#18794E]
                    "
                  >
                    <CheckCircle2 size={25} />
                  </div>

                  <h2 className="mt-4 text-[19px] font-extrabold text-[#17202A]">
                    Request submitted
                  </h2>

                  <p className="mt-1 text-[13px] leading-5 text-[#59635D]">
                    We're now looking for sellers
                    that can help with your request.
                  </p>

                  <div className="mt-5 rounded-[14px] bg-white p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#8A847D]">
                      Your request code
                    </p>

                    <p className="mt-1 text-[24px] font-extrabold tracking-[0.12em] text-[#FF5A36]">
                      {createdRequest.requestCode}
                    </p>

                    <p className="mt-2 text-[11px] leading-4 text-[#77716A]">
                      Keep this code. You can use it
                      later to find this request.
                    </p>
                  </div>

                  {createdRequest.matches &&
                    createdRequest.matches.length > 0 && (
                      <div className="mt-4 rounded-[14px] bg-white p-4">
                        <p className="text-[12px] font-bold text-[#17202A]">
                          Sellers found
                        </p>

                        <div className="mt-2 space-y-2">
                          {createdRequest.matches
                            .slice(0, 3)
                            .map((match) => (
                              <Link
                                key={match.id}
                                href={`/seller/${match.business.id}`}
                                className="
                                  flex
                                  items-center
                                  justify-between
                                  rounded-[10px]
                                  border
                                  border-[#EAE6DF]
                                  px-3
                                  py-2.5
                                  text-[12px]
                                  font-semibold
                                  text-[#33302C]
                                  hover:bg-[#FFF7ED]
                                "
                              >
                                <span>
                                  {match.business.name}
                                </span>

                                <span className="text-[#FF5A36]">
                                  View
                                </span>
                              </Link>
                            ))}
                        </div>
                      </div>
                    )}

                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link
                      href="/my-requests"
                      className="
                        inline-flex
                        items-center
                        gap-2
                        rounded-[11px]
                        bg-[#FF5A36]
                        px-4
                        py-2.5
                        text-[12px]
                        font-bold
                        text-white
                      "
                    >
                      <ClipboardList size={15} />
                      View my requests
                    </Link>

                    <button
                      type="button"
                      onClick={() =>
                        setCreatedRequest(null)
                      }
                      className="
                        rounded-[11px]
                        border
                        border-[#EAE6DF]
                        bg-white
                        px-4
                        py-2.5
                        text-[12px]
                        font-bold
                        text-[#55504A]
                      "
                    >
                      Make another request
                    </button>
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  className="mt-6 space-y-4"
                >
                  {/* Main request */}
                  <div
                    className="
                      rounded-[20px]
                      border
                      border-[#EAE6DF]
                      bg-white
                      p-4
                      md:p-5
                    "
                  >
                    <h2 className="text-[15px] font-bold text-[#17202A]">
                      What are you looking for?
                    </h2>

                    <p className="mt-1 text-[11px] text-[#8A847D]">
                      Start with the item or service
                      you need.
                    </p>

                    <div className="mt-4">
                      <label
                        htmlFor="query"
                        className="mb-1.5 block text-[12px] font-bold text-[#33302C]"
                      >
                        Item or service
                      </label>

                      <input
                        id="query"
                        name="query"
                        value={query}
                        onChange={(event) =>
                          setQuery(event.target.value)
                        }
                        placeholder="e.g. black sneakers"
                        className="
                          w-full
                          rounded-[11px]
                          border
                          border-[#EAE6DF]
                          bg-[#FCFAF6]
                          px-3
                          py-3
                          text-[13px]
                          text-[#17202A]
                          outline-none
                          transition
                          placeholder:text-[#AAA39B]
                          focus:border-[#FF5A36]
                          focus:bg-white
                          focus:ring-2
                          focus:ring-[#FF5A36]/10
                        "
                      />
                    </div>

                    <div className="mt-4">
                      <label
                        htmlFor="category"
                        className="mb-1.5 block text-[12px] font-bold text-[#33302C]"
                      >
                        Category
                      </label>

                      <select
                        id="category"
                        name="category"
                        value={category}
                        onChange={(event) =>
                          setCategory(event.target.value)
                        }
                        className="
                          w-full
                          rounded-[11px]
                          border
                          border-[#EAE6DF]
                          bg-[#FCFAF6]
                          px-3
                          py-3
                          text-[13px]
                          text-[#17202A]
                          outline-none
                          focus:border-[#FF5A36]
                        "
                      >
                        <option value="">
                          Select a category
                        </option>

                        {CATEGORIES.map(
                          (item) => (
                            <option
                              key={item}
                              value={item}
                            >
                              {item}
                            </option>
                          )
                        )}
                      </select>
                    </div>
                  </div>

                  {/* Details */}
                  <div
                    className="
                      rounded-[20px]
                      border
                      border-[#EAE6DF]
                      bg-white
                      p-4
                      md:p-5
                    "
                  >
                    <h2 className="text-[15px] font-bold text-[#17202A]">
                      Tell us a little more
                    </h2>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="budget"
                          className="mb-1.5 block text-[12px] font-bold text-[#33302C]"
                        >
                          Budget
                        </label>

                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-[#8A847D]">
                            ₦
                          </span>

                          <input
                            id="budget"
                            name="budget"
                            type="number"
                            min="0"
                            value={budget}
                            onChange={(event) =>
                              setBudget(
                                event.target.value
                              )
                            }
                            placeholder="30000"
                            className="
                              w-full
                              rounded-[11px]
                              border
                              border-[#EAE6DF]
                              bg-[#FCFAF6]
                              py-3
                              pl-7
                              pr-3
                              text-[13px]
                              outline-none
                              focus:border-[#FF5A36]
                            "
                          />
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="quantity"
                          className="mb-1.5 block text-[12px] font-bold text-[#33302C]"
                        >
                          Quantity
                        </label>

                        <input
                          id="quantity"
                          name="quantity"
                          type="number"
                          min="1"
                          value={quantity}
                          onChange={(event) =>
                            setQuantity(
                              event.target.value
                            )
                          }
                          placeholder="1"
                          className="
                            w-full
                            rounded-[11px]
                            border
                            border-[#EAE6DF]
                            bg-[#FCFAF6]
                            px-3
                            py-3
                            text-[13px]
                            outline-none
                            focus:border-[#FF5A36]
                          "
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <label
                        htmlFor="locationArea"
                        className="mb-1.5 block text-[12px] font-bold text-[#33302C]"
                      >
                        Area
                      </label>

                      <div className="relative">
                        <MapPin
                          size={15}
                          className="
                            absolute
                            left-3
                            top-1/2
                            -translate-y-1/2
                            text-[#8A847D]
                          "
                        />

                        <input
                          id="locationArea"
                          name="locationArea"
                          value={locationArea}
                          onChange={(event) =>
                            setLocationArea(
                              event.target.value
                            )
                          }
                          placeholder="e.g. Yaba"
                          className="
                            w-full
                            rounded-[11px]
                            border
                            border-[#EAE6DF]
                            bg-[#FCFAF6]
                            py-3
                            pl-9
                            pr-3
                            text-[13px]
                            outline-none
                            focus:border-[#FF5A36]
                          "
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <label
                        htmlFor="description"
                        className="mb-1.5 block text-[12px] font-bold text-[#33302C]"
                      >
                        More details
                      </label>

                      <textarea
                        id="description"
                        name="description"
                        value={description}
                        onChange={(event) =>
                          setDescription(
                            event.target.value
                          )
                        }
                        rows={4}
                        placeholder="Any colour, size, brand, or other details?"
                        className="
                          w-full
                          resize-none
                          rounded-[11px]
                          border
                          border-[#EAE6DF]
                          bg-[#FCFAF6]
                          px-3
                          py-3
                          text-[13px]
                          leading-5
                          outline-none
                          placeholder:text-[#AAA39B]
                          focus:border-[#FF5A36]
                          focus:bg-white
                        "
                      />
                    </div>

                    {/* Image */}
                    <div className="mt-4">
                      <label
                        htmlFor="request-image"
                        className="
                          flex
                          cursor-pointer
                          items-center
                          gap-3
                          rounded-[12px]
                          border
                          border-dashed
                          border-[#DCD5CC]
                          bg-[#FCFAF6]
                          p-3
                          transition
                          hover:border-[#FFB39F]
                          hover:bg-[#FFF7ED]
                        "
                      >
                        <div
                          className="
                            flex
                            h-10
                            w-10
                            shrink-0
                            items-center
                            justify-center
                            rounded-[10px]
                            bg-[#FFE0D6]
                            text-[#FF5A36]
                          "
                        >
                          {uploading ? (
                            <Loader2
                              size={18}
                              className="animate-spin"
                            />
                          ) : (
                            <ImagePlus size={18} />
                          )}
                        </div>

                        <div>
                          <p className="text-[12px] font-bold text-[#33302C]">
                            {uploading
                              ? "Uploading image..."
                              : imageUrl
                                ? "Image added"
                                : "Add a photo"}
                          </p>

                          <p className="mt-0.5 text-[10px] text-[#8A847D]">
                            A photo can help sellers
                            understand what you need.
                          </p>
                        </div>
                      </label>

                      <input
                        id="request-image"
                        type="file"
                        accept="image/*"
                        onChange={
                          handleImageUpload
                        }
                        className="hidden"
                      />
                    </div>
                  </div>

                  {/* Contact */}
                  <div
                    className="
                      rounded-[20px]
                      border
                      border-[#EAE6DF]
                      bg-white
                      p-4
                      md:p-5
                    "
                  >
                    <h2 className="text-[15px] font-bold text-[#17202A]">
                      How can sellers reach you?
                    </h2>

                    <p className="mt-1 text-[11px] leading-4 text-[#8A847D]">
                      No account is needed. Use a
                      WhatsApp or phone number.
                    </p>

                    <div className="mt-4">
                      <label
                        htmlFor="buyerContact"
                        className="mb-1.5 block text-[12px] font-bold text-[#33302C]"
                      >
                        WhatsApp or phone number
                      </label>

                      <input
                        id="buyerContact"
                        name="buyerContact"
                        type="tel"
                        value={buyerContact}
                        onChange={(event) =>
                          setBuyerContact(
                            event.target.value
                          )
                        }
                        placeholder="08012345678"
                        className="
                          w-full
                          rounded-[11px]
                          border
                          border-[#EAE6DF]
                          bg-[#FCFAF6]
                          px-3
                          py-3
                          text-[13px]
                          outline-none
                          placeholder:text-[#AAA39B]
                          focus:border-[#FF5A36]
                          focus:bg-white
                        "
                      />
                    </div>
                  </div>

                  {/* Error */}
                  {error && (
                    <div
                      className="
                        rounded-[12px]
                        border
                        border-[#F0C7BE]
                        bg-[#FFF1ED]
                        px-4
                        py-3
                        text-[12px]
                        font-semibold
                        text-[#9F2D18]
                      "
                    >
                      {error}
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading || uploading}
                    className="
                      flex
                      w-full
                      items-center
                      justify-center
                      gap-2
                      rounded-[13px]
                      bg-[#FF5A36]
                      px-4
                      py-3.5
                      text-[13px]
                      font-bold
                      text-white
                      transition
                      hover:bg-[#E94D2D]
                      disabled:cursor-not-allowed
                      disabled:opacity-60
                    "
                  >
                    {loading ? (
                      <>
                        <Loader2
                          size={17}
                          className="animate-spin"
                        />
                        Finding sellers...
                      </>
                    ) : (
                      <>
                        <Plus size={17} />
                        Submit request
                      </>
                    )}
                  </button>

                  <p className="text-center text-[10px] leading-4 text-[#99928A]">
                    You don't need an account to
                    make a request.
                  </p>
                </form>
              )}
            </div>
          </section>
        </div>

        {/* Mobile navigation */}
        <nav
          className="
            fixed
            bottom-0
            left-0
            right-0
            z-40
            border-t
            border-[#EAE6DF]
            bg-white/95
            px-2
            py-2
            backdrop-blur
            md:hidden
          "
        >
          <div className="mx-auto flex max-w-[500px] items-center justify-around">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="
                    flex
                    min-w-[62px]
                    flex-col
                    items-center
                    gap-1
                    rounded-[10px]
                    px-2
                    py-1.5
                    text-[10px]
                    font-semibold
                    text-[#77716A]
                  "
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </main>
  );
}