"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronsUpDown } from "@/components/icons";

/** Account menu. `placement="sidebar"` is the full-width row at the foot of the admin sidebar. */
export function NavUser({ user, onLogout, placement = "header" }) {
  const initials = (user?.name || "A").charAt(0).toUpperCase();
  const inSidebar = placement === "sidebar";

  return (
    <DropdownMenu>
      {inSidebar ? (
        <DropdownMenuTrigger className="admin-nav-user">
          <Avatar className="size-7 shrink-0 rounded-lg after:rounded-lg after:border-white/15">
            {user?.avatar ? (
              <AvatarImage src={user.avatar} alt={user.name} className="rounded-lg" />
            ) : null}
            <AvatarFallback className="rounded-lg bg-white/15 text-xs font-semibold text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="grid min-w-0 flex-1 text-left leading-tight">
            <span className="truncate text-[0.8125rem] font-medium text-(--p-color-nav-text-active)">
              {user?.name || "Admin"}
            </span>
            <span className="truncate text-[0.6875rem] text-(--p-color-nav-text-secondary)">
              {user?.email}
            </span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-(--p-color-nav-text-secondary)" aria-hidden />
        </DropdownMenuTrigger>
      ) : (
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="h-[38px] gap-2 px-2 text-white hover:bg-white/10 hover:text-white data-popup-open:bg-white/10 data-popup-open:text-white"
          />
        }
      >
        <Avatar className="size-[38px] rounded-lg after:rounded-lg after:border-white/20 grayscale">
          {user?.avatar ? (
            <AvatarImage src={user.avatar} alt={user.name} className="rounded-lg" />
          ) : null}
          <AvatarFallback className="rounded-lg bg-white/15 text-sm text-white">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span className="hidden max-w-[120px] truncate text-xs font-medium sm:inline">
          {user?.name || "Admin"}
        </span>
      </DropdownMenuTrigger>
      )}
      <DropdownMenuContent
        className="min-w-56"
        side={inSidebar ? "top" : "bottom"}
        align={inSidebar ? "start" : "end"}
        sideOffset={inSidebar ? 6 : 4}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-xs">
              <Avatar className="size-8 rounded-lg">
                {user?.avatar ? (
                  <AvatarImage src={user.avatar} alt={user.name} />
                ) : null}
                <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-medium">{user?.name}</span>
                <span className="truncate text-[10px] text-muted-foreground">
                  {user?.email}
                </span>
              </div>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onLogout}>
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
