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
          path: '/dashboard', // Se accede como /dashboard
          name: 'dashboard',
          component: DashboardView
        },
        {
          path: '/socios', // Se accede como /socios
          name: 'socios',
          component: SociosView
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
          component: () => import('../views/PerfilView.vue')
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

// --- EL GUARDIÁN DE SEGURIDAD (Optimizado) ---
router.beforeEach(async (to, from, next) => {
  const { data: { session } } = await supabase.auth.getSession()

  // Si la ruta requiere auth y no hay sesión
  if (to.matched.some(record => record.meta.requiresAuth) && !session) {
    next({ name: 'login' })
  }
  // Si está logueado y quiere ir al login, al dashboard
  else if (to.name === 'login' && session) {
    next({ name: 'dashboard' })
  }
  else {
    next()
  }
})

export default router