import { Moon, Sun, Laptop } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="size-8 rounded-full border-border bg-background/50 backdrop-blur-sm hover:bg-accent transition-colors"
          title="Toggle Theme"
        >
          <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-amber-500" />
          <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-blue-400" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36 bg-card/95 backdrop-blur-md border-border">
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          className={`flex items-center gap-2 text-xs font-medium cursor-pointer ${theme === "light" ? "bg-accent text-accent-foreground font-semibold" : ""}`}
        >
          <Sun className="size-3.5 text-amber-500" /> Light
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          className={`flex items-center gap-2 text-xs font-medium cursor-pointer ${theme === "dark" ? "bg-accent text-accent-foreground font-semibold" : ""}`}
        >
          <Moon className="size-3.5 text-blue-400" /> Dark
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("system")}
          className={`flex items-center gap-2 text-xs font-medium cursor-pointer ${theme === "system" ? "bg-accent text-accent-foreground font-semibold" : ""}`}
        >
          <Laptop className="size-3.5 text-muted-foreground" /> System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
