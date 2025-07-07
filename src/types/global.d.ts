import type { PrometheusService } from '@/plugins/odyssey'
import type { TeamsService } from '@/plugins/teams'

export {} // -- turns the file into a module

declare global {
  // eslint-disable-next-line no-var
  var prometheusService: PrometheusService | undefined
  var teamsService: TeamsService | undefined
}
