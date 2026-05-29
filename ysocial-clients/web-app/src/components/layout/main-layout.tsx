"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Home,
  Search,
  PlusSquare,
  Bell,
  User,
  Sun,
  Moon,
  Languages,
  LogOut,
  MoreHorizontal,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslation } from "@/hooks/use-translation";
import { LAYOUT } from "@/lib/constants/layout";
import { useLocale, useIsCollapsed, useUIActions } from "@/lib/store/ui-store";
import { useAuthUser, useAuthActions } from "@/features/auth/store/auth-store";
import { RightSidebar } from "./right-sidebar";

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  const locale = useLocale();
  const isCollapsed = useIsCollapsed();
  const { setLocale, toggleSidebar } = useUIActions();

  const user = useAuthUser();
  const { clearAuth } = useAuthActions();

  // Dynamically map navigation profile link to the authenticated user's username
  const profileHref = user?.username ? `/@${user.username}` : "/@ysocial_member";

  // Navigation config mapping to translation keys
  const navItems = [
    { href: "/", icon: Home, label: t("nav.home") },
    { href: "/search", icon: Search, label: t("nav.search") },
    { href: "/create", icon: PlusSquare, label: t("nav.write") },
    { href: "/notifications", icon: Bell, label: t("nav.notifications") },
    { href: profileHref, icon: User, label: t("nav.profile") },
  ];

  const handleLanguageToggle = () => {
    setLocale(locale === "vi" ? "en" : "vi");
  };

  const handleLogout = () => {
    clearAuth();
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-zinc-50 dark:bg-black text-black dark:text-zinc-50 transition-colors duration-300 font-sans">

        <div className={`max-w-7xl mx-auto flex justify-center w-full min-h-screen relative px-4 transition-all duration-300
                         ${isCollapsed ? LAYOUT.sidebar.padCollapsed : LAYOUT.sidebar.padWide
          }`}>
          {/* ==================== LEFT SIDEBAR (340PX) ==================== */}
          <aside className={`hidden lg:flex flex-col justify-between pt-6 pb-4 px-3 border-r border-zinc-200/60 dark:border-zinc-900/60 fixed left-0 top-0 h-screen bg-white/80 dark:bg-black/60 backdrop-blur-md z-30 shrink-0 transition-all duration-300
                             ${isCollapsed ? LAYOUT.sidebar.collapsed : `w-sidebar-collapsed ${LAYOUT.sidebar.xlWide}`
            }`}>
            <div className="flex flex-col items-center xl:items-start w-full gap-8">

              {/* Header Container enclosing Logo and Collapse Button */}
              <div className={`flex ${isCollapsed ? "flex-col items-center gap-4" : "flex-col xl:flex-row items-center gap-4 xl:justify-between"} w-full px-1`}>
                {/* Logo */}
                <Link href="/" className="flex items-center gap-3 transition-transform active:scale-95 duration-200 shrink-0">
                  <div className="h-10 w-10 rounded-full bg-zinc-950 dark:bg-zinc-50 flex items-center justify-center font-bold text-white dark:text-black text-xl shadow-lg shrink-0">
                    Y
                  </div>
                  {!isCollapsed && (
                    <span className="hidden xl:inline font-bold tracking-tight text-xl bg-linear-to-r from-black to-zinc-600 dark:from-white dark:to-zinc-400 bg-clip-text text-transparent">
                      YSocial
                    </span>
                  )}
                </Link>

                {/* Sidebar Collapse Toggle Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleSidebar}
                  className={`h-8 w-8 rounded-full border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-150 dark:hover:bg-zinc-900 active:scale-90 transition-all shrink-0 ${isCollapsed ? "mt-2" : "mt-2 xl:mt-0"
                    }`}
                >
                  <ChevronRight className={`h-4 w-4 transition-transform duration-300 ${isCollapsed ? "" : "rotate-180"}`} />
                </Button>
              </div>

              {/* Navigation links */}
              <nav className="flex flex-col gap-1.5 w-full">
                {navItems.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Tooltip key={item.label}>
                      <TooltipTrigger asChild>
                        <Link
                          href={item.href}
                          className={`flex items-center gap-4 py-2.5 px-3.5 rounded-xl transition-all duration-300 active:scale-95 ${isActive
                            ? "bg-zinc-100 dark:bg-zinc-900 text-black dark:text-white font-semibold"
                            : "text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-zinc-100 hover:bg-zinc-100/30 dark:hover:bg-zinc-900/20"
                            } ${isCollapsed ? "justify-center" : "justify-center xl:justify-start"}`}
                        >
                          <Icon
                            className={`h-5.5 w-5.5 transition-transform duration-300 ${isActive ? "scale-105" : "hover:scale-105"} shrink-0`}
                            fill={isActive ? "currentColor" : "none"}
                            strokeWidth={isActive ? 2.5 : 2}
                          />
                          {!isCollapsed && (
                            <span className="hidden xl:inline text-[14.5px]">{item.label}</span>
                          )}
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="lg:block xl:hidden">
                        {item.label}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </nav>
            </div>

            {/* Profile Dropdown */}
            <div className="flex flex-col items-center w-full gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className={`w-full ${isCollapsed
                      ? "justify-center p-0 h-12 rounded-full"
                      : "justify-center xl:justify-start py-6 px-3 rounded-2xl"
                      } hover:bg-zinc-100 dark:hover:bg-zinc-900 text-left transition-all active:scale-98`}
                  >
                    <div className="flex items-center gap-3 w-full justify-center xl:justify-start">
                      <Avatar className="h-9 w-9 border border-zinc-200 dark:border-zinc-800 shrink-0">
                        <AvatarImage src={user?.avatarUrl || "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=100&q=80"} alt={user?.displayName || "User"} />
                        <AvatarFallback className="bg-zinc-200 dark:bg-zinc-800 text-xs font-semibold">
                          {user?.displayName?.charAt(0).toUpperCase() || "Y"}
                        </AvatarFallback>
                      </Avatar>
                      {!isCollapsed && (
                        <>
                          <div className="hidden xl:flex flex-col flex-1 min-w-0">
                            <span className="font-semibold text-sm truncate">{user?.displayName || "YSocial User"}</span>
                            <span className="text-zinc-400 text-xs truncate">@{user?.username || "ysocial_member"}</span>
                          </div>
                          <MoreHorizontal className="hidden xl:block h-4 w-4 text-zinc-400 shrink-0" />
                        </>
                      )}
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-2xl border-zinc-200/55 dark:border-zinc-900 bg-white dark:bg-zinc-950 p-2 shadow-xl z-50">
                  <DropdownMenuItem className="rounded-xl px-3 py-2 cursor-pointer focus:bg-zinc-100 dark:focus:bg-zinc-900">
                    <Link href={profileHref} className="flex items-center w-full gap-2 text-sm">
                      <User className="h-4 w-4 text-zinc-400" />
                      {t("nav.profile")}
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator className="bg-zinc-100 dark:bg-zinc-900" />

                  {/* Locale Toggle Item in drop menu */}
                  <DropdownMenuItem onClick={handleLanguageToggle} className="rounded-xl px-3 py-2 cursor-pointer focus:bg-zinc-100 dark:focus:bg-zinc-900">
                    <div className="flex items-center justify-between w-full text-sm">
                      <span className="flex items-center gap-2">
                        <Languages className="h-4 w-4 text-zinc-400" />
                        {t("common.language")}
                      </span>
                      <span className="text-[10px] font-bold uppercase bg-zinc-100 dark:bg-zinc-900 px-2 py-0.5 rounded text-zinc-600 dark:text-zinc-400">
                        {locale}
                      </span>
                    </div>
                  </DropdownMenuItem>

                  {/* Dark Mode Switcher inside Dropdown */}
                  <DropdownMenuItem onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="rounded-xl px-3 py-2 cursor-pointer focus:bg-zinc-100 dark:focus:bg-zinc-900">
                    <div className="flex items-center justify-between w-full text-sm">
                      <span className="flex items-center gap-2">
                        {theme === "dark" ? (
                          <>
                            <Sun className="h-4 w-4 text-amber-500" />
                            Light Mode
                          </>
                        ) : (
                          <>
                            <Moon className="h-4 w-4 text-indigo-500" />
                            Dark Mode
                          </>
                        )}
                      </span>
                    </div>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator className="bg-zinc-100 dark:bg-zinc-900" />
                  <DropdownMenuItem onClick={handleLogout} className="rounded-xl px-3 py-2 cursor-pointer text-red-650 focus:text-red-650 focus:bg-red-50 dark:focus:bg-red-950/20">
                    <div className="flex items-center w-full gap-2 text-sm font-medium">
                      <LogOut className="h-4 w-4" />
                      {t("nav.logout")}
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </aside>

          {/* ==================== CENTER COLUMN (600PX) ==================== */}
          <main className="w-[600px] shrink-0 border-r border-zinc-200/60 dark:border-zinc-900/60 min-h-screen flex flex-col pb-16 lg:pb-0 bg-white dark:bg-black">
            {children}
          </main>

          {/* ==================== RIGHT SIDEBAR ==================== */}
          <RightSidebar />

        </div>

        {/* ==================== MOBILE NAVIGATION BAR ==================== */}
        <nav className="fixed bottom-0 left-0 right-0 h-16 border-t border-zinc-200/60 dark:border-zinc-900/60 bg-white/80 dark:bg-black/80 backdrop-blur-lg flex items-center justify-around z-30 lg:hidden px-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`p-3 rounded-full active:scale-90 transition-all ${isActive ? "text-black dark:text-white" : "text-zinc-400"
                  }`}
              >
                <Icon className="h-6 w-6" />
              </Link>
            );
          })}
          {/* Quick toggle inside mobile layout */}
          <button
            onClick={handleLanguageToggle}
            className="p-3 text-zinc-400 active:scale-90 transition-all font-bold text-xs uppercase"
          >
            {locale}
          </button>
        </nav>

      </div>
    </TooltipProvider>
  );
}
export default MainLayout;
