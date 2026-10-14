import type { ReactElement } from 'react'
import type { SyncStatus } from '@shared/types'
import type { Route } from '../../khatwa/nav'
import Expedition from '../../routes/Expedition'
import Me from '../../routes/Me'
import Habits from '../../routes/Habits'
import HabitDetail from '../../routes/HabitDetail'
import Todo from '../../routes/Todo'
import CalendarRoute from '../../routes/Calendar'
import Progress from '../../routes/Progress'
import WeeklyReview from '../../routes/WeeklyReview'
import Achievements from '../../routes/Achievements'
import LetGo from '../../routes/LetGo'
import Ceremony from '../../routes/Ceremony'
import LetGoPlanner from '../../routes/LetGoPlanner'
import Settings from '../../routes/Settings'

/**
 * Screens the new design has not redrawn yet. They run unchanged inside the new shell,
 * and `.k2-classic` hands them the new palette and typeface through the variables they
 * already read, so they sit comfortably beside the redrawn ones.
 */
export default function Classic({ route, status, onSettingsChanged }: { route: Route; status: SyncStatus | null; onSettingsChanged: () => void }) {
  const screen: ReactElement | null = (() => {
    switch (route.name) {
      case 'expedition':
        return <Expedition resume={route.resume} />
      case 'me':
        return <Me />
      case 'habits':
        return <Habits edit={route.edit} />
      case 'habit':
        return <HabitDetail id={route.id} />
      case 'todo':
        return <Todo />
      case 'calendar':
        return <CalendarRoute />
      case 'progress':
        return <Progress />
      case 'review':
        return <WeeklyReview />
      case 'achievements':
        return <Achievements />
      case 'letgo':
        return <LetGo id={route.id} create={route.create} />
      case 'ceremony':
        return <Ceremony id={route.id} />
      case 'letgoPlan':
        return <LetGoPlanner />
      case 'settings':
        return <Settings status={status} onSettingsChanged={onSettingsChanged} />
      default:
        return null
    }
  })()
  return <div className="k2-classic">{screen}</div>
}
