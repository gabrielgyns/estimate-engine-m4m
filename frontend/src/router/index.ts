import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from "vue-router";
import { authClient } from "../lib/auth-client";

const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "login",
    component: () => import("../views/LoginView.vue"),
    meta: { guestOnly: true },
  },
  {
    path: "/register",
    name: "register",
    component: () => import("../views/RegisterView.vue"),
    meta: { guestOnly: true },
  },
  {
    path: "/app",
    component: () => import("../layouts/AppLayout.vue"),
    meta: { requiresAuth: true },
    children: [
      {
        path: "",
        name: "dashboard",
        component: () => import("../views/DashboardView.vue"),
      },
      {
        path: "leads",
        name: "leads",
        component: () => import("../views/LeadsView.vue"),
      },
      {
        path: "leads/new",
        name: "lead-new",
        component: () => import("../views/LeadCreateView.vue"),
      },
      {
        path: "organizations",
        name: "organizations",
        component: () => import("../views/OrganizationsView.vue"),
      },
      {
        path: "account",
        name: "account",
        component: () => import("../views/AccountView.vue"),
      },
    ],
  },
  { path: "/", redirect: "/app" },
  { path: "/:pathMatch(.*)*", redirect: "/app" },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

// Resolve the session fresh on each navigation so guards reflect reality even
// on a hard refresh / deep link. getSession also keeps the reactive store warm.
router.beforeEach(async (to) => {
  let isAuthed = false;
  try {
    const { data } = await authClient.getSession();
    isAuthed = Boolean(data);
  } catch {
    // Backend unreachable — treat as unauthenticated rather than blocking nav.
    isAuthed = false;
  }

  if (to.meta.requiresAuth && !isAuthed) {
    return { name: "login", query: { redirect: to.fullPath } };
  }
  if (to.meta.guestOnly && isAuthed) {
    return { name: "dashboard" };
  }
  return true;
});
