"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import Image from "next/image";
import { useSelector } from "react-redux";
import { RootState } from "../../../store";
import SimpleAudioPlayer from "../../../components/audio/SimpleAudioPlayer";
import { getMediaUrl, formatViewCount } from "../../../utils/media";
import Layout from "@/components/layout/Layout";
import apiClient, { storiesAPI } from "@/utils/api";
import CommentSection from "@/components/comments/CommentSection";
import { useLanguage } from "@/contexts/LanguageContext";
import DailyPopup from "@/components/DailyPopup";
import {
  isAffiliateCooldown,
  markAffiliateShown,
} from "@/utils/affiliateCooldown";

interface Story {
  id: string;
  slug: string;
  title: string;
  description: string;
  thumbnailUrl?: string;
  audioUrl?: string;
  type: "TEXT" | "AUDIO";
  status: "DRAFT" | "PUBLISHED" | "HIDDEN";
  viewCount: number;
  author: {
    id: string;
    name: string;
    avatar?: string;
  };
  genres: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
  chapters: Array<{
    id: string;
    number: number;
    title: string;
    content?: string;
    audioUrl?: string;
    isLocked: boolean;
    affiliateId?: string;
    affiliate?: {
      id: string;
      provider: string;
      targetUrl: string;
      label?: string;
      isActive: boolean;
    };
    createdAt: string;
  }>;
  affiliate?: {
    id: string;
    provider: string;
    targetUrl: string;
    label?: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface StoryPageProps {
  params: {
    slug: string;
  };
  initialStory?: Story | null;
}

export default function StoryDetailClient({ params, initialStory }: StoryPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { user } = useSelector((state: RootState) => state.auth);
  const { t } = useLanguage();

  const [story, setStory] = useState<Story | null>(initialStory || null);
  const [loading, setLoading] = useState(!initialStory);
  const [error, setError] = useState<string | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [selectedChapter, setSelectedChapter] = useState<number>(1);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [trendingStories, setTrendingStories] = useState<Story[]>([]);
  const [isLoadingTrending, setIsLoadingTrending] = useState(true);
  // Capture initial 'from' value so affiliate check works even after URL cleanup
  const initialFrom = useRef(searchParams.get("from"));

  const { slug } = params;

  useEffect(() => {
    if (slug) {
      if (!initialStory) {
        fetchStory();
      }
      fetchTrendingStories();
    }
  }, [slug]);

  // Clean 'from' param from URL on mount (keep URL clean)
  useEffect(() => {
    if (searchParams.get("from")) {
      const cleanParams = new URLSearchParams(searchParams.toString());
      cleanParams.delete("from");
      const qs = cleanParams.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initialFrom.current && story?.affiliate?.targetUrl && !isAffiliateCooldown(story.affiliate.targetUrl)) {
      markAffiliateShown(story.affiliate.targetUrl);
      window.open(story.affiliate.targetUrl, "_blank", "noopener");
    }
  }, [story?.affiliate?.targetUrl]);

  useEffect(() => {
    const chapterFromUrl = Number(searchParams.get("chapter"));
    if (chapterFromUrl && chapterFromUrl > 0) {
      setSelectedChapter(chapterFromUrl);
    } else {
      // No chapter param — set state to 1 without modifying URL
      setSelectedChapter(1);
    }
  }, [searchParams]);

  const updateUrlChapter = (chapterNumber: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("chapter", String(chapterNumber));
    router.push(`${pathname}?${params.toString()}`);
  };

  const fetchStory = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiClient.get(`/stories/${slug}`);

      if (!response.data) {
        if (response.status === 404) {
          setError("Truyện không tồn tại");
        } else {
          setError("Có lỗi xảy ra khi tải truyện");
        }
        return;
      }

      setStory(response.data.story);

      // Check if bookmarked
      if (user && response.data.story) {
        checkBookmarkStatus(response.data.story.id);
      }
    } catch (error) {
      console.error("Error fetching story:", error);
      setError("Có lỗi xảy ra khi tải truyện");
    } finally {
      setLoading(false);
    }
  };

  const checkBookmarkStatus = async (storyId: string) => {
    try {
      const response = await apiClient.get(
        `/bookmarks/check?storyId=${storyId}`
      );

      if (response.data) {
        setIsBookmarked(response.data.isBookmarked);
      }
    } catch (error) {
      console.error("Error checking bookmark status:", error);
    }
  };

  const fetchTrendingStories = async () => {
    try {
      setIsLoadingTrending(true);
      const response = await storiesAPI.getStories({
        sort: "viewCount",
        limit: 8,
      });
      setTrendingStories((response.data || []) as Story[]);
    } catch (error) {
      console.error("Error fetching trending stories:", error);
    } finally {
      setIsLoadingTrending(false);
    }
  };

  const onClickTrendingCard = (story: Story) => {
    // Navigate to story detail without opening affiliate link
    router.push(`/stories/${story.slug}?from=trending`);
  };

  const toggleBookmark = async () => {
    if (!user) {
      router.push("/auth/login");
      return;
    }

    try {
      const response = isBookmarked
        ? await apiClient.delete("/bookmarks", { data: { storyId: story?.id } })
        : await apiClient.post("/bookmarks", { storyId: story?.id });

      if (response.data) {
        setIsBookmarked(!isBookmarked);
      } else {
        alert("Có lỗi xảy ra khi cập nhật bookmark");
      }
    } catch (error) {
      console.error("Error toggling bookmark:", error);
      alert("Có lỗi xảy ra khi cập nhật bookmark");
    }
  };

  const isAudioStory = story?.type === "AUDIO";

  const currentChapter = story?.chapters.find(
    (c) => c.number === selectedChapter
  );

  const handleChapterChange = (chapterNumber: number) => {
    setSelectedChapter(chapterNumber);
    // Cập nhật URL param
    const params = new URLSearchParams(searchParams.toString());
    params.set("chapter", String(chapterNumber));
    router.push(`${pathname}?${params.toString()}`);
  };

  const onSelectChapter = (chapterNumber: number) => {
    const nextChapter = story?.chapters.find(
      (c) => c.number === chapterNumber
    );

    // If next chapter has an active affiliate link, open it in new tab
    if (nextChapter?.affiliate?.isActive && nextChapter.affiliate.targetUrl) {
      window.open(nextChapter.affiliate.targetUrl, "_blank");
    }
    handleChapterChange(chapterNumber);
  }

  const handleNextChapter = () => {
    if (story && selectedChapter < story.chapters.length) {
      const nextChapterNumber = selectedChapter + 1;
      const nextChapter = story.chapters.find(
        (c) => c.number === nextChapterNumber
      );

      // If next chapter has an active affiliate link, open it in new tab
      if (nextChapter?.affiliate?.isActive && nextChapter.affiliate.targetUrl) {
        window.open(nextChapter.affiliate.targetUrl, "_blank");
      }

      handleChapterChange(nextChapterNumber);
    }
  };

  const handlePrevChapter = () => {
    if (selectedChapter > 1) {
      handleChapterChange(selectedChapter - 1);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
          <div className="container mx-auto px-4 py-8">
            <div className="max-w-6xl mx-auto">
              {/* Loading skeleton */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 animate-pulse">
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                  <div className="lg:col-span-1">
                    <div className="w-full aspect-[3/2] bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
                  </div>
                  <div className="lg:col-span-3">
                    <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded mb-4"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !story) {
    return (
      <Layout>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4">📚</div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              {error || "Truyện không tồn tại"}
            </h1>
            <button
              onClick={() => router.push("/")}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Về trang chủ
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Daily Popup - only show on mobile and for this story */}
      {story && (
        <DailyPopup
          storyId={story.id}
          affiliateLink={story.affiliate?.targetUrl ? story.affiliate.targetUrl : undefined}
        />
      )}

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className={`container mx-auto ${!isAudioStory ? 'px-4' : ''} py-8`}>
          <div className="max-w-6xl mx-auto">
            {/* Chapter Content */}
            {isAudioStory && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-5">
                <div className="border-gray-200 dark:border-gray-700 mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {story.title}
                  </h2>
                </div>

                <div>
                  <Image
                    src={getMediaUrl(story?.thumbnailUrl || "")}
                    alt={story.title}
                    width={600}
                    height={400}
                    className="w-full h-auto rounded-lg object-contain bg-gray-200 dark:bg-gray-700"
                  />
                  {currentChapter?.audioUrl ? (
                    <div className="mb-6 mt-4">
                      <SimpleAudioPlayer
                        src={getMediaUrl(currentChapter.audioUrl)}
                        title={`${story.title} - Chương ${currentChapter.number}`}
                      />
                    </div>
                  ) : null}

                  {/* Deal Hot Section */}
                  {story.affiliate?.targetUrl && (
                    <div

                      className="block my-6 p-4 bg-gradient-to-r from-orange-50 via-red-50 to-orange-50 dark:from-orange-900/30 dark:via-red-900/30 dark:to-orange-900/30 border-2 border-orange-400 dark:border-orange-600 rounded-xl shadow-xl hover:shadow-2xl transform hover:scale-[1.02] transition-all duration-300"
                    >
                      <p className=" font-bold items-center flex-wrap text-center">
                        <span className="text-2xl animate-bounce">🔥</span>
                        <span className="text-orange-600 dark:text-orange-400 animate-pulse"> Cảm ơn bạn đã ghé thăm Kho Truyện Hay
                          Nếu bạn thấy những câu chuyện ở đây thú vị, hãy bấm vào đây để ủng hộ tụi mình nhé. Mỗi lượt click của bạn là một nguồn động lực lớn để website tiếp tục chia sẻ thêm nhiều truyện hay mỗi ngày!</span>
                        <a href={story.affiliate.targetUrl}
                          target="_blank"
                          rel="noopener noreferrer" className="underline text-blue-600 block"> 👉Click giúp tụi mình tại đây</a>
                      </p>
                    </div>
                  )}

                </div>
              </div>
            )}
            {/* Story Header */}
            {!isAudioStory && <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Thumbnail */}
                <div className="lg:col-span-1">
                  <div className="w-full rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-700">
                    {story.thumbnailUrl ? (
                      <Image
                        src={getMediaUrl(story.thumbnailUrl)}
                        alt={story.title}
                        width={600}
                        height={400}
                        className="w-full h-auto object-contain"
                      />
                    ) : (
                      <div className="w-full aspect-[3/2] flex items-center justify-center">
                        <span className="text-gray-400 text-lg">📚</span>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="mt-4 space-y-2">
                    <button
                      onClick={toggleBookmark}
                      className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${isBookmarked
                        ? "bg-red-100 text-red-700 hover:bg-red-200"
                        : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                        }`}
                    >
                      {isBookmarked ? "❤️ Đã yêu thích" : "🤍 Yêu thích"}
                    </button>

                    {story.affiliate && (
                      <a
                        href={story.affiliate.targetUrl}
                        target="_blank"
                        className="w-full py-2 px-4 bg-green-100 text-green-700 hover:bg-green-200 rounded-lg font-medium transition-colors text-center block"
                      >
                        📥{" "}
                        {story.affiliate.label ||
                          `Tải từ ${story.affiliate.provider}`}
                      </a>
                    )}
                  </div>
                </div>

                {/* Story Info */}
                <div className="lg:col-span-3">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                        {story.title}
                      </h1>
                      <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                        <span>👤 {story.author.name}</span>
                        <span>👁️ {formatViewCount(story.viewCount)}</span>
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${isAudioStory
                            ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                            : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                            }`}
                        >
                          {isAudioStory ? "🎧 Audio" : "📖 Text"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Genres */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {story.genres.map((genre) => (
                      <span
                        key={genre.id}
                        className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-sm"
                      >
                        {genre.name}
                      </span>
                    ))}
                  </div>

                  {/* Description */}
                  <div className="text-gray-700 dark:text-gray-300">
                    <h3 className="text-lg font-semibold mb-2">Mô tả</h3>
                    <div
                      className={`${!showFullDescription ? "line-clamp-4" : ""
                        }`}
                    >
                      {story.description || "Chưa có mô tả"}
                    </div>
                    {story.description && story.description.length > 200 && (
                      <button
                        onClick={() =>
                          setShowFullDescription(!showFullDescription)
                        }
                        className="text-blue-600 dark:text-blue-400 hover:underline mt-2"
                      >
                        {showFullDescription ? "Thu gọn" : "Xem thêm"}
                      </button>
                    )}
                  </div>

                  {/* Chapter Statistics */}
                  <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {!isAudioStory && `📚 ${story.chapters.length} chương •`}  📅 Cập nhật:{" "}
                      {new Date(story.updatedAt).toLocaleDateString("vi-VN")}
                    </div>
                  </div>
                </div>
              </div>
            </div>}
            {/* Chapter Navigation */}
            {story.chapters.length > 0 && story.type === "TEXT" && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                  Danh sách chương
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Chapter selector */}
                  <div>
                    <select
                      value={selectedChapter}
                      onChange={(e) =>
                        handleChapterChange(Number(e.target.value))
                      }
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    >
                      {story.chapters.map((chapter) => (
                        <option key={chapter.id} value={chapter.number}>
                          Chương {chapter.number}: {chapter.title}
                          {chapter.isLocked && !user ? " 🔒" : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Navigation buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={handlePrevChapter}
                      disabled={selectedChapter <= 1}
                      className="text-sm sm:text-base flex-1 py-2 px-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      ← Chương trước
                    </button>
                    <button
                      onClick={handleNextChapter}
                      disabled={selectedChapter >= story.chapters.length}
                      className="text-sm sm:text-base flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Chương tiếp →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Chapter Content */}
            {currentChapter && story.type === "TEXT" && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                <div className="border-b border-gray-200 dark:border-gray-700 pb-4 mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Chương {currentChapter.number}: {currentChapter.title}
                  </h2>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                    📅{" "}
                    {new Date(currentChapter.createdAt).toLocaleDateString(
                      "vi-VN"
                    )}
                  </div>
                </div>

                {currentChapter.isLocked && !user ? (
                  <div className="text-center py-12">
                    <div className="text-6xl mb-4">🔒</div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                      Chương này cần đăng nhập
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      Vui lòng đăng nhập để đọc chương này
                    </p>
                    <button
                      onClick={() => router.push("/auth/login")}
                      className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Đăng nhập
                    </button>
                  </div>
                ) : (
                  <div>
                    {currentChapter.audioUrl ? (
                      <div className="mb-6">
                        <SimpleAudioPlayer
                          src={getMediaUrl(currentChapter.audioUrl)}
                          title={`${story.title} - Chương ${currentChapter.number}`}
                        />
                      </div>
                    ) : null}

                    {currentChapter.content && (
                      <div className="prose prose-lg dark:prose-invert max-w-none">
                        <div
                          className="text-gray-700 dark:text-gray-300 leading-relaxed"
                          dangerouslySetInnerHTML={{
                            __html: currentChapter.content.replace(
                              /\n/g,
                              "<br />"
                            ),
                          }}
                        />
                      </div>
                    )}

                    {!currentChapter.content && story.type === "TEXT" && (
                      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                        <div className="text-4xl mb-4">📝</div>
                        <p>Nội dung chương đang được cập nhật...</p>
                      </div>
                    )}


                  </div>
                )}

                {/* Chapter Navigation Footer */}
                <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={handlePrevChapter}
                    disabled={selectedChapter <= 1}
                    className="flex items-center gap-2 py-2 px-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Chương trước
                  </button>

                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {selectedChapter} / {story.chapters.length}
                  </span>

                  <button
                    onClick={handleNextChapter}
                    disabled={selectedChapter >= story.chapters.length}
                    className="flex items-center gap-2 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {(() => {
                      const nextChapter = story.chapters.find(
                        (c) => c.number === selectedChapter + 1
                      );
                      return nextChapter?.affiliate?.isActive ? (
                        <>
                          Chương tiếp →
                          <span className="text-xs bg-yellow-400 text-yellow-900 px-1 rounded">
                            📥
                          </span>
                        </>
                      ) : (
                        "Chương tiếp →"
                      );
                    })()}
                  </button>
                </div>
              </div>
            )}

            {/* Trending Stories Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mt-6">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center">
                🔥 <span className="ml-2">{t("home.trending")}</span>
              </h3>

              {isLoadingTrending ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <div key={index} className="flex flex-col space-y-2">
                      <div className="w-full h-48 bg-gray-300 dark:bg-gray-600 rounded"></div>
                      <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded"></div>
                      <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-2/3"></div>
                    </div>
                  ))}
                </div>
              ) : trendingStories.length > 0 ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {trendingStories.map((trendingStory: Story, index: number) => (
                    <div
                      key={trendingStory.id}
                      onClick={() => onClickTrendingCard(trendingStory)}
                      className="group cursor-pointer"
                    >
                      <div className="relative">
                        {/* Ranking Badge */}
                        <div className="absolute top-2 left-2 z-10">
                          <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-lg">
                            {index + 1}
                          </div>
                        </div>

                        {/* Thumbnail */}
                        {trendingStory.thumbnailUrl ? (
                          <Image
                            src={getMediaUrl(trendingStory.thumbnailUrl)}
                            alt={trendingStory.title}
                            width={300}
                            height={200}
                            className="w-full h-48 object-cover rounded-lg mb-3 group-hover:opacity-90 transition-opacity"
                          />
                        ) : (
                          <div className="w-full h-48 bg-gray-200 dark:bg-gray-700 rounded-lg mb-3 flex items-center justify-center">
                            <span className="text-4xl">📚</span>
                          </div>
                        )}

                        {/* Story Info */}
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 line-clamp-2 mb-1">
                          {trendingStory.title}
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                          {trendingStory.author?.name || "Tác giả không xác định"}
                        </p>
                        <div className="flex items-center text-xs text-gray-400">
                          <svg
                            className="w-3 h-3 mr-1"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                          {formatViewCount(trendingStory.viewCount || 0)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                  Chưa có truyện trending.
                </p>
              )}
            </div>

            {/* Comments Section */}
            {currentChapter && (
              <div className="mt-6">
                <CommentSection
                  chapterId={currentChapter.id}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout >
  );
}
