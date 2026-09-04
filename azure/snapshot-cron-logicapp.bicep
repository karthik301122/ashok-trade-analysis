// Daily snapshot rebuild for Traders Scope (Azure-only cron).
// Deploy: see azure/deploy-snapshot-cron.ps1 or DEPLOY.md

@description('Azure region (use same region as tradersscope-app)')
param location string = resourceGroup().location

@description('Logic App name')
param logicAppName string = 'tradersscope-snapshot-cron'

@description('Public site URL (no trailing slash)')
param siteUrl string = 'https://tradersscope.com'

@secure()
@description('Must match ADMIN_API_KEY on tradersscope-app')
param adminApiKey string

@description('Hour in AUS Eastern time (24h) for daily rebuild')
param scheduleHour int = 17

@description('Minute in AUS Eastern time for daily rebuild')
param scheduleMinute int = 30

var workflowDefinition = {
  $schema: 'https://schema.management.azure.com/providers/Microsoft.Logic/workflows/2016-06-01/workflowdefinition.json#'
  contentVersion: '1.0.0.0'
  triggers: {
    Daily_rebuild: {
      type: 'Recurrence'
      recurrence: {
        frequency: 'Day'
        interval: 1
        schedule: {
          hours: [string(scheduleHour)]
          minutes: [scheduleMinute]
        }
        timeZone: 'AUS Eastern Standard Time'
      }
    }
  }
  actions: {
    Rebuild_desk_from_EODHD: {
      type: 'Http'
      runAfter: {}
      inputs: {
        method: 'POST'
        uri: '${siteUrl}/api/snapshot/refresh?force=1&priority=desk'
        headers: {
          'x-admin-key': adminApiKey
        }
      }
    }
  }
}

resource logicApp 'Microsoft.Logic/workflows@2019-05-01' = {
  name: logicAppName
  location: location
  properties: {
    state: 'Enabled'
    definition: workflowDefinition
  }
}

output logicAppId string = logicApp.id
output logicAppName string = logicApp.name
