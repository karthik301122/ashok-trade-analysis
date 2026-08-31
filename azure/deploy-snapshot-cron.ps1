# Deploy Azure Logic App cron (daily snapshot rebuild).
# Prerequisites: az login, ADMIN_API_KEY already set on tradersscope-app.
#
# Usage:
#   $key = "your-admin-api-key"   # same value as Azure App Service ADMIN_API_KEY
#   .\azure\deploy-snapshot-cron.ps1 -ResourceGroup tradersscope-rg -AdminApiKey $key

param(
  [string] $ResourceGroup = 'tradersscope-rg',
  [Parameter(Mandatory = $true)]
  [string] $AdminApiKey,
  [string] $SiteUrl = 'https://tradersscope.com',
  [string] $LogicAppName = 'tradersscope-snapshot-cron',
  [string] $Location = 'australiaeast'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

Write-Host "Deploying Logic App '$LogicAppName' in $ResourceGroup ($Location)..."

az deployment group create `
  --resource-group $ResourceGroup `
  --template-file "$root\azure\snapshot-cron-logicapp.bicep" `
  --parameters `
    logicAppName=$LogicAppName `
    siteUrl=$SiteUrl `
    adminApiKey=$AdminApiKey `
    location=$Location

Write-Host "Done. Open Azure Portal -> Logic App -> Run History to verify the first trigger."
