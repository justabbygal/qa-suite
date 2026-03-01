# Run this from inside your qa-suite folder
# cd C:\Users\abiga\qa-suite

# Create directories
New-Item -ItemType Directory -Force -Path src/app
New-Item -ItemType Directory -Force -Path src/components/ui
New-Item -ItemType Directory -Force -Path src/lib
New-Item -ItemType Directory -Force -Path src/modules
New-Item -ItemType Directory -Force -Path src/types
New-Item -ItemType Directory -Force -Path supabase/migrations
New-Item -ItemType Directory -Force -Path public

# package.json
@'
{
  "name": "qa-suite",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-dropdown-menu": "^2.0.6",
    "@radix-ui/react-label": "^2.0.2",
    "@radix-ui/react-select": "^2.0.0",
    "@radix-ui/react-separator": "^1.0.3",
    "@radix-ui/react-slot": "^1.0.2",
    "@radix-ui/react-tabs": "^1.0.4",
    "@radix-ui/react-toast": "^1.1.5",
    "@radix-ui/react-tooltip": "^1.0.7",
    "@supabase/supabase-js": "^2.39.0",
    "@supabase/ssr": "^0.1.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "lucide-react": "^0.303.0",
    "next": "14.1.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "tailwind-merge": "^2.2.0",
    "tailwindcss-animate": "^1.0.7"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/react": "^18.2.47",
    "@types/react-dom": "^18.2.18",
    "autoprefixer": "^10.4.16",
    "eslint": "^8.56.0",
    "eslint-config-next": "14.1.0",
    "postcss": "^8.4.33",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.3.3"
  }
}
'@ | Set-Content -Path "package.json" -Encoding UTF8

# next.config.js
@'
/** @type {import('next').NextConfig} */
const nextConfig = {};
module.exports = nextConfig;
'@ | Set-Content -Path "next.config.js" -Encoding UTF8

# tsconfig.json
@'
{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
'@ | Set-Content -Path "tsconfig.json" -Encoding UTF8

# tailwind.config.ts
@'
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/modules/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
'@ | Set-Content -Path "tailwind.config.ts" -Encoding UTF8

# postcss.config.js
@'
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
'@ | Set-Content -Path "postcss.config.js" -Encoding UTF8

# components.json
@'
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
'@ | Set-Content -Path "components.json" -Encoding UTF8

# .eslintrc.json
@'
{ "extends": "next/core-web-vitals" }
'@ | Set-Content -Path ".eslintrc.json" -Encoding UTF8

# .env.local.example
@'
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
LINEAR_API_KEY=lin_api_your-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
'@ | Set-Content -Path ".env.local.example" -Encoding UTF8

# src/app/globals.css
@'
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 0 0% 3.9%;
    --primary: 0 0% 9%;
    --primary-foreground: 0 0% 98%;
    --secondary: 0 0% 96.1%;
    --secondary-foreground: 0 0% 9%;
    --muted: 0 0% 96.1%;
    --muted-foreground: 0 0% 45.1%;
    --accent: 0 0% 96.1%;
    --accent-foreground: 0 0% 9%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 89.8%;
    --input: 0 0% 89.8%;
    --ring: 0 0% 3.9%;
    --radius: 0.5rem;
  }
  .dark {
    --background: 0 0% 3.9%;
    --foreground: 0 0% 98%;
    --card: 0 0% 3.9%;
    --card-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 0 0% 9%;
    --secondary: 0 0% 14.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 0 0% 14.9%;
    --muted-foreground: 0 0% 63.9%;
    --accent: 0 0% 14.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 14.9%;
    --input: 0 0% 14.9%;
    --ring: 0 0% 83.1%;
  }
}
@layer base {
  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
}
'@ | Set-Content -Path "src/app/globals.css" -Encoding UTF8

# src/app/layout.tsx
@'
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "QA Suite",
  description: "Custom AI-native QA Suite for Fruition",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
'@ | Set-Content -Path "src/app/layout.tsx" -Encoding UTF8

# src/app/page.tsx
@'
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">QA Suite</h1>
        <p className="text-muted-foreground text-lg">Custom AI-native QA Suite for Fruition</p>
      </div>
    </main>
  );
}
'@ | Set-Content -Path "src/app/page.tsx" -Encoding UTF8

# src/lib/utils.ts
@'
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
'@ | Set-Content -Path "src/lib/utils.ts" -Encoding UTF8

# src/lib/supabase.ts
@'
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
'@ | Set-Content -Path "src/lib/supabase.ts" -Encoding UTF8

# src/components/ui/button.tsx
@'
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
'@ | Set-Content -Path "src/components/ui/button.tsx" -Encoding UTF8

# src/components/ui/card.tsx
@'
import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (<div ref={ref} className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)} {...props} />)
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (<div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />)
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (<h3 ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props} />)
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (<p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />)
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (<div ref={ref} className={cn("p-6 pt-0", className)} {...props} />)
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (<div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />)
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
'@ | Set-Content -Path "src/components/ui/card.tsx" -Encoding UTF8

# src/types/index.ts
@'
export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "manager" | "tester" | "viewer";
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestCase {
  id: string;
  title: string;
  description?: string;
  steps: TestStep[];
  projectId: string;
  status: "draft" | "active" | "archived";
  priority: "low" | "medium" | "high" | "critical";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestStep {
  order: number;
  action: string;
  expectedResult: string;
}

export interface TestRun {
  id: string;
  testCaseId: string;
  status: "pending" | "running" | "passed" | "failed" | "skipped";
  executedBy?: string;
  startedAt?: string;
  completedAt?: string;
  notes?: string;
}
'@ | Set-Content -Path "src/types/index.ts" -Encoding UTF8

# src/modules/README.md
@'
# QA Suite Modules

Each module maps to a Linear project in the Custom QA Suite initiative.

Planned modules:
- user-management/     User roles, permissions, auth
- integrations-engine/ Linear, Figma, GitHub connections
- test-management/     Test case CRUD, organization
- execution-engine/    WebdriverIO test execution
- reporting/           Dashboards, analytics, exports
- ai-features/         AI-powered test generation, analysis
'@ | Set-Content -Path "src/modules/README.md" -Encoding UTF8

# gitkeeps
"" | Set-Content -Path "supabase/migrations/.gitkeep"
"" | Set-Content -Path "public/.gitkeep"

Write-Host ""
Write-Host "Scaffold created! Now run:" -ForegroundColor Green
Write-Host "  git add -A"
Write-Host "  git commit -m 'Add Next.js scaffold with shadcn/ui, Tailwind, Supabase'"
Write-Host "  git push"
