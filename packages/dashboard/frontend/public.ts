export { Button, LinkButton, buttonVariants } from "./components/ui/button";
export { Badge } from "./components/ui/badge";
export { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogTitle, DialogTrigger } from "./components/ui/dialog";
export { DropdownMenu, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./components/ui/dropdown-menu";
export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./components/ui/card";
export { Input } from "./components/ui/input";
export { Label } from "./components/ui/label";
export { I18nProvider, useI18n } from "./lib/i18n";
export type { I18nDictionary, Language } from "./lib/i18n";
export { LanguageSwitcher } from "./components/LanguageSwitcher";
export { DashboardContext, dashboardExtension, defineExtension, registeredNavigation, registeredRoutes, registeredTopBar, subscribeExtensions, useNavigation, useRoutes, useTopBar } from "./extension";
export type { DashboardExtensionApi, DashboardNavigationItem, DashboardRoute, DashboardTopBarItem } from "./extension";
export * from "./vendor";
// Star exports from React, React Router, and Lucide can hide colliding names.
// Keep framework exports explicit so plugin bundles can import one shared runtime.
export { default } from "react";
export {
  Children, Component, PureComponent, Profiler, Suspense,
  Fragment, StrictMode, createContext, createElement, cloneElement, forwardRef,
  isValidElement, memo, lazy,
  useCallback, useContext, useDebugValue, useDeferredValue, useEffect, useId,
  useImperativeHandle, useInsertionEffect, useLayoutEffect, useMemo, useReducer,
  useRef, useState, useSyncExternalStore, useTransition, startTransition,
} from "react";
export { createRoot, hydrateRoot } from "react-dom/client";
export { createPortal } from "react-dom";
export { jsx, jsxs, Fragment as FragmentJSX } from "react/jsx-runtime";
export {
  BrowserRouter, Link, NavLink, Navigate, Outlet, Route, Routes,
} from "react-router-dom";
export { api, apiURL } from "./api";
