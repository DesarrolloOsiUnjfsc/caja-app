import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '../lib/supabase'
import LoginView from '../views/LoginView.vue'
import MainLayout from '../layouts/MainLayout.vue' // <-- El nuevo contenedor con el menú
import DashboardView from '../views/DashboardView.vue'
import SociosView from '../views/SociosView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'login',
      component: LoginView,
      meta: { requiresAuth: false }
    },
    {
      // Definimos una ruta base que carga el Layout (Menú + Sidebar)
      path: '/admin',
      component: MainLayout,
      meta: { requiresAuth: true }, // Protegemos todo el grupo de una vez
      children: [
        {
          path: '/dashboard',
          name: 'dashboard',
          component: DashboardView,
          meta: { requiresAuth: true }
        },
        {
          path: '/socios',
          name: 'socios',
          component: SociosView,
          meta: { requiresAuth: true }
        },
        {
          path: '/caja',
          name: 'Caja',
          component: () => import('../views/caja.vue'),
          meta: {
            requiresAuth: true,
            roles: ['ADMINISTRADOR', 'TESORERO', 'SECRETARIO']
          }
        },
        {
          path: '/perfil',
          name: 'perfil',
          component: () => import('../views/PerfilView.vue'),
          meta: { requiresAuth: true }
        }
      ]
    },
    // Redirección por si el usuario entra a una ruta que no existe
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

// --- EL GUARDIÁN DE SEGURIDAD (Blindado) ---
router.beforeEach(async (to, from, next) => {
  const { data: { session } } = await supabase.auth.getSession()
  const isAuthRequired = to.matched.some(record => record.meta.requiresAuth)

  // 1. Si no hay sesión y la ruta es protegida -> Al Login
  if (isAuthRequired && !session) {
    return next({ name: 'login' })
  }

  // 2. Si ya está logueado e intenta ir al Login -> Al Dashboard
  if (to.name === 'login' && session) {
    return next({ name: 'dashboard' })
  }

  // 3. En cualquier otro caso, permitir el paso
  next()
})

export default router