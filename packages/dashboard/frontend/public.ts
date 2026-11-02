export { Button, buttonVariants } from "./components/ui/button";
export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./components/ui/card";
export { Input } from "./components/ui/input";
export { Label } from "./components/ui/label";
export { DashboardContext, dashboardExtension, defineExtension } from "./extension";
export type { DashboardExtensionApi, DashboardRoute } from "./extension";
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
