import { migrationUrl } from './env'
import { runMigrations } from '../src/db/migrate'

const url = migrationUrl()
const masked = url.replace(/:\/\/([^:]+):[^@]+@/, '://$1:****@')

runMigrations(url)
  .then(() => {
    console.log(`  ✓ Migration амжилттай ажиллалаа → ${masked}`)
    process.exit(0)
  })
  .catch((error) => {
    console.error('  ✗ Migration амжилтгүй боллоо:', error)
    process.exit(1)
  })
