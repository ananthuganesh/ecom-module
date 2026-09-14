"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { reviewService } from "@/api";
import StarRating, { StarIcon } from "@/components/storefront/StarRating";
import { useAuthStore } from "@/store/useAuthStore";
import { userErrorMessage } from "@/lib/userMessage";
import {
  REVIEW_BODY_MAX,
  REVIEW_TITLE_MAX,
  formatReviewDate,
  ratingBreakdown,
  reviewCountLabel,
  reviewDraftError,
} from "@/lib/reviews";

const PAGE_SIZE = 6;
const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "highest", label: "Highest rated" },
  { value: "lowest", label: "Lowest rated" },
];
const STAR_WORDS = ["", "Poor", "Fair", "Good", "Very good", "Loved it"];

function StarPicker({ value, onChange }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div
        className="flex items-center gap-1"
        role="radiogroup"
        aria-label="Your rating"
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} star${star === 1 ? "" : "s"}`}
            onMouseEnter={() => setHover(star)}
            onClick={() => onChange(star)}
            className="rounded p-0.5 text-black focus-visible:outline-2 focus-visible:outline-black"
          >
            <StarIcon filled={shown >= star} size={26} />
          </button>
        ))}
        <span className="ml-2 text-[13px] text-gray-600">{STAR_WORDS[shown] || ""}</span>
    </div>
  );
}

function ReviewForm({ productId, initial, onSaved, onCancel }) {
  const [rating, setRating] = useState(initial?.rating || 0);
  const [title, setTitle] = useState(initial?.title || "");
  const [body, setBody] = useState(initial?.body || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const problem = reviewDraftError({ rating, title, body });
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await reviewService.saveMine(productId, { rating, title, body });
      onSaved(result);
    } catch (err) {
      setError(userErrorMessage(err, "Couldn't save your review. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-lg border border-gray-200 p-4" noValidate>
      <p className="text-[14px] font-semibold text-black">
        {initial ? "Edit your review" : "Write a review"}
      </p>
      <div className="mt-3">
        <StarPicker
          value={rating}
          onChange={(star) => {
            setRating(star);
            setError("");
          }}
        />
      </div>
      <label htmlFor="review-title" className="mt-4 block text-[12px] font-medium text-gray-600">
        Title <span className="font-normal text-gray-400">(optional)</span>
      </label>
      <input
        id="review-title"
        value={title}
        maxLength={REVIEW_TITLE_MAX}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Sum it up, e.g. Great fit, heavy cotton"
        className="mt-1 h-10 w-full rounded-md border border-gray-200 px-3 text-[13px] outline-none focus:border-black"
      />
      <label htmlFor="review-body" className="mt-3 block text-[12px] font-medium text-gray-600">
        Review <span className="font-normal text-gray-400">(optional)</span>
      </label>
      <textarea
        id="review-body"
        value={body}
        maxLength={REVIEW_BODY_MAX}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder="How was the fit, fabric and print after a few washes?"
        className="mt-1 w-full resize-y rounded-md border border-gray-200 px-3 py-2 text-[13px] outline-none focus:border-black"
      />
      {error ? <p role="alert" className="mt-2 text-[12px] text-[#DF1721]">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="h-10 rounded-md bg-black px-5 text-[13px] font-semibold text-white transition hover:bg-gray-900 disabled:bg-gray-300"
        >
          {saving ? "Saving…" : initial ? "Save changes" : "Post review"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-10 rounded-md border border-gray-200 px-5 text-[13px] font-semibold text-black transition hover:border-black"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function ProductReviews({ productId }) {
  const pathname = usePathname();
  const signedIn = useAuthStore((s) => Boolean(s.userInfo?._id));

  const [data, setData] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("newest");
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState(null);
  const [writing, setWriting] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(
    async (pageNum, { append = false } = {}) => {
      if (!productId) return;
      setLoading(true);
      try {
        const result = await reviewService.list(productId, { page: pageNum, pageSize: PAGE_SIZE, sort });
        setData(result);
        setReviews((prev) => (append ? [...prev, ...(result?.reviews || [])] : result?.reviews || []));
        setPage(pageNum);
      } catch {
        if (!append) setReviews([]);
      } finally {
        setLoading(false);
      }
    },
    [productId, sort]
  );

  useEffect(() => {
    load(1);
  }, [load]);

  useEffect(() => {
    setWriting(false);
    setNotice("");
    if (!signedIn || !productId) {
      setMine(null);
      return;
    }
    let cancelled = false;
    reviewService
      .getMine(productId)
      .then((state) => !cancelled && setMine(state))
      .catch(() => !cancelled && setMine(null));
    return () => {
      cancelled = true;
    };
  }, [productId, signedIn]);

  const summary = data?.summary || { average: 0, count: 0, distribution: {} };
  const hasMore = page < (data?.pages || 1);
  // No reviews and no form open: centre the message instead of a two-column layout.
  const isEmpty = !loading && summary.count === 0 && !writing;
  const canWrite = signedIn && mine?.canReview;

  const handleSaved = (result) => {
    setWriting(false);
    setMine((prev) => ({ ...(prev || {}), canReview: true, review: result?.review }));
    setNotice(result?.created ? "Thanks — your review is live." : "Your review was updated.");
    load(1);
  };

  let action = null;
  if (!signedIn) {
    action = (
      <Link
        href={`/login?redirect=${encodeURIComponent(`${pathname}#reviews`)}`}
        className="text-[13px] font-semibold text-black underline underline-offset-2"
      >
        Bought this? Sign in to review it
      </Link>
    );
  } else if (canWrite && !writing) {
    action = (
      <button
        type="button"
        onClick={() => {
          setWriting(true);
          setNotice("");
        }}
        className="h-10 rounded-md border border-black px-5 text-[13px] font-semibold text-black transition hover:bg-black hover:text-white"
      >
        {mine?.review ? "Edit your review" : "Write a review"}
      </button>
    );
  }

  // No reviews yet: hide the section, except for a buyer who can write the first one.
  // Also stay hidden until the first load so it doesn't flash in and out.
  if (!data || (summary.count === 0 && !canWrite && !writing && !notice)) return null;

  return (
    <section id="reviews" className="scroll-mt-24 border-t border-gray-100 bg-white py-6 md:py-10">
      <div className="mx-auto w-full max-w-5xl px-4 lg:px-8">
        <header className="mb-5 text-center md:mb-8">
          <h2 className="title-knewave text-2xl leading-none tracking-tight normal-case md:text-4xl">
            Customer <span className="title-knewave-accent">Reviews</span>
          </h2>
        </header>

        <div
          className={
            isEmpty
              ? "flex flex-col items-center text-center"
              : "grid gap-6 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] md:gap-10"
          }
        >
          <div className={`flex flex-col gap-4 ${isEmpty ? "items-center" : ""}`}>
            {summary.count > 0 ? (
              <>
                <div className="flex items-center gap-3">
                  <span className="text-4xl font-bold tabular-nums text-black">
                    {Number(summary.average).toFixed(1)}
                  </span>
                  <div className="flex flex-col gap-1">
                    <StarRating rating={summary.average} size={16} />
                    <span className="text-[12px] text-gray-500">
                      {reviewCountLabel(summary.count)} · verified buyers
                    </span>
                  </div>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {ratingBreakdown(summary.distribution, summary.count).map((row) => (
                    <li key={row.star} className="flex items-center gap-2 text-[12px] text-gray-600">
                      <span className="w-3 tabular-nums">{row.star}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <span className="block h-full rounded-full bg-black" style={{ width: `${row.percent}%` }} />
                      </span>
                      <span className="w-6 text-right tabular-nums text-gray-400">{row.count}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : !loading ? (
              <p className="text-[13px] text-gray-600">
                No reviews yet. Reviews come only from customers who received this product.
              </p>
            ) : null}
            {action ? <div>{action}</div> : null}
            {notice ? <p role="status" className="text-[12px] text-emerald-600">{notice}</p> : null}
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            {writing ? (
              <ReviewForm
                productId={productId}
                initial={mine?.review}
                onSaved={handleSaved}
                onCancel={() => setWriting(false)}
              />
            ) : null}

            {summary.count > 1 ? (
              <div className="flex justify-end">
                <label htmlFor="review-sort" className="sr-only">Sort reviews</label>
                <select
                  id="review-sort"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="h-9 rounded-md border border-gray-200 bg-white px-2 text-[13px] outline-none focus:border-black"
                >
                  {SORTS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            ) : null}

            {reviews.length > 0 ? (
              <ul className="flex flex-col divide-y divide-gray-100">
                {reviews.map((review) => (
                  <li key={review._id} className="py-4 first:pt-0">
                    <div className="flex items-center justify-between gap-3">
                      <StarRating rating={review.rating} size={14} />
                      <span className="text-[12px] text-gray-400">{formatReviewDate(review.createdAt)}</span>
                    </div>
                    {review.title ? (
                      <p className="mt-2 text-[14px] font-semibold text-black">{review.title}</p>
                    ) : null}
                    {review.body ? (
                      <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-gray-700">
                        {review.body}
                      </p>
                    ) : null}
                    <p className="mt-2 text-[12px] text-gray-500">
                      <span className="font-medium text-gray-700">{review.authorName}</span>
                      {" · "}
                      <span className="text-emerald-600">Verified buyer</span>
                      {review.size ? ` · Size ${review.size}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}

            {hasMore ? (
              <button
                type="button"
                disabled={loading}
                onClick={() => load(page + 1, { append: true })}
                className="h-10 self-center rounded-md border border-gray-200 px-5 text-[13px] font-semibold text-black transition hover:border-black disabled:text-gray-300"
              >
                {loading ? "Loading…" : "Show more reviews"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
