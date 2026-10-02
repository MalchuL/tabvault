import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Render the card surface and its vertical content layout.
 * @param {React.ComponentProps<"div">} props - Component properties and children.
 * @returns {React.ReactElement} Card container.
 */
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm",
        className
      )}
      {...props}
    />
  );
}

/**
 * Arrange a card heading and optional action in the header grid.
 * @param {React.ComponentProps<"div">} props - Component properties and children.
 * @returns {React.ReactElement} Card header.
 */
function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  );
}

/**
 * Render the card title with heading emphasis.
 * @param {React.ComponentProps<"div">} props - Component properties and children.
 * @returns {React.ReactElement} Card title.
 */
function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  );
}

/**
 * Render subdued supporting text in a card.
 * @param {React.ComponentProps<"div">} props - Component properties and children.
 * @returns {React.ReactElement} Card description.
 */
function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

/**
 * Place an optional action beside the card heading.
 * @param {React.ComponentProps<"div">} props - Component properties and children.
 * @returns {React.ReactElement} Card header action.
 */
function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  );
}

/**
 * Apply the card body inset to arbitrary content.
 * @param {React.ComponentProps<"div">} props - Component properties and children.
 * @returns {React.ReactElement} Card body.
 */
function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  );
}

/**
 * Align card actions and content below the body.
 * @param {React.ComponentProps<"div">} props - Component properties and children.
 * @returns {React.ReactElement} Card footer.
 */
function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
