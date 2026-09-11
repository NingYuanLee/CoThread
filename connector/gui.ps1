param(
  [Parameter(Mandatory=$true)][string]$StatePath,
  [Parameter(Mandatory=$true)][string]$CommandPath,
  [Parameter(Mandatory=$true)][string]$IconPath,
  [Parameter(Mandatory=$true)][int]$ParentPid
)

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CoThreadWindowIcon {
  [DllImport("user32.dll", CharSet=CharSet.Auto)]
  public static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
}
'@

[xml]$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
  xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
  Title="CoThread Connector" Width="1180" Height="720" MinWidth="860" MinHeight="600"
  WindowStartupLocation="CenterScreen" Background="#F7F8F5" FontFamily="Microsoft YaHei UI" FontSize="12">
  <Window.Resources>
    <Style TargetType="Button"><Setter Property="MinHeight" Value="32"/><Setter Property="Padding" Value="12,5"/><Setter Property="Margin" Value="0,0,8,0"/><Setter Property="Background" Value="#FFFFFF"/><Setter Property="BorderBrush" Value="#D9E0D5"/></Style>
    <Style TargetType="TextBox"><Setter Property="MinHeight" Value="32"/><Setter Property="Padding" Value="8,5"/><Setter Property="BorderBrush" Value="#D9E0D5"/></Style>
    <Style TargetType="ComboBox"><Setter Property="MinHeight" Value="32"/><Setter Property="Padding" Value="6,3"/><Setter Property="BorderBrush" Value="#D9E0D5"/></Style>
  </Window.Resources>
  <Grid>
    <Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="*"/><RowDefinition Height="Auto"/></Grid.RowDefinitions>
    <Border Grid.Row="0" Background="#FFFFFF" BorderBrush="#E1E6DE" BorderThickness="0,0,0,1" Padding="20,16">
      <DockPanel>
        <StackPanel DockPanel.Dock="Left"><TextBlock Text="CoThread 本地连接器" FontSize="18" FontWeight="SemiBold" Foreground="#283329"/><TextBlock x:Name="VersionText" Margin="0,4,0,0" Foreground="#849083"/></StackPanel>
        <StackPanel DockPanel.Dock="Right" Orientation="Horizontal" HorizontalAlignment="Right" VerticalAlignment="Center"><Ellipse x:Name="StatusDot" Width="9" Height="9" Fill="#A7ADA5" Margin="0,0,7,0"/><TextBlock x:Name="StatusText" VerticalAlignment="Center" Foreground="#657064"/></StackPanel>
      </DockPanel>
    </Border>
    <ScrollViewer Grid.Row="1" VerticalScrollBarVisibility="Auto">
      <StackPanel Margin="20,18">
        <StackPanel x:Name="PairPanel">
          <TextBlock Text="连接账号" FontSize="14" FontWeight="SemiBold" Margin="0,0,0,10"/>
          <Grid Margin="0,0,0,8"><Grid.ColumnDefinitions><ColumnDefinition Width="110"/><ColumnDefinition Width="*"/></Grid.ColumnDefinitions><TextBlock Text="服务地址" VerticalAlignment="Center"/><TextBox x:Name="ServerInput" Grid.Column="1"/></Grid>
          <TextBlock Text="将打开共序网页，由你登录并确认这台设备。" Foreground="#657064" Margin="110,2,0,8"/>
          <StackPanel Orientation="Horizontal" HorizontalAlignment="Right" Margin="0,4,0,16"><Button x:Name="PairButton" Content="网页登录并授权" Background="#536F49" Foreground="White"/></StackPanel>
          <Separator Margin="0,0,0,16"/>
        </StackPanel>

        <StackPanel x:Name="PrerequisitePanel">
          <DockPanel Margin="0,0,0,10"><TextBlock Text="本机环境" FontSize="14" FontWeight="SemiBold"/><Button x:Name="CheckButton" Content="重新检测" DockPanel.Dock="Right" HorizontalAlignment="Right"/></DockPanel>
          <Grid Margin="0,0,0,8"><Grid.ColumnDefinitions><ColumnDefinition Width="110"/><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><TextBlock Text="Git"/><TextBlock x:Name="GitStatusText" Grid.Column="1"/><TextBlock x:Name="GitHintText" Grid.Column="2" Foreground="#A45D4A"/></Grid>
          <Grid Margin="0,0,0,8"><Grid.ColumnDefinitions><ColumnDefinition Width="110"/><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><TextBlock Text="Codex CLI"/><TextBlock x:Name="CodexStatusText" Grid.Column="1"/><Button x:Name="CodexLoginButton" Grid.Column="2" Content="登录 Codex"/></Grid>
          <Separator Margin="0,6,0,16"/>
        </StackPanel>

        <StackPanel x:Name="ProjectPanel">
          <DockPanel Margin="0,0,0,10"><TextBlock Text="项目与本地仓库" FontSize="14" FontWeight="SemiBold"/><Button x:Name="RefreshButton" Content="刷新项目" DockPanel.Dock="Right" HorizontalAlignment="Right"/></DockPanel>
          <DataGrid x:Name="ProjectGrid" AutoGenerateColumns="False" CanUserAddRows="False" CanUserDeleteRows="False"
            HeadersVisibility="Column" GridLinesVisibility="Horizontal" IsReadOnly="False" RowHeaderWidth="0" MaxHeight="230" Margin="0,0,0,14">
            <DataGrid.Columns>
              <DataGridTextColumn Header="项目" Binding="{Binding name}" IsReadOnly="True" Width="1.1*"/>
              <DataGridTemplateColumn Header="本地 Git 仓库" Width="2*"><DataGridTemplateColumn.CellTemplate><DataTemplate>
                <DockPanel><Button x:Name="BrowseProjectButton" Content="选择" DockPanel.Dock="Right" Tag="{Binding id}" Margin="6,1,0,1"/><TextBlock Text="{Binding root}" TextTrimming="CharacterEllipsis" VerticalAlignment="Center" ToolTip="{Binding root}"/></DockPanel>
              </DataTemplate></DataGridTemplateColumn.CellTemplate></DataGridTemplateColumn>
              <DataGridTemplateColumn Header="推送" Width="54"><DataGridTemplateColumn.CellTemplate><DataTemplate>
                <CheckBox x:Name="GitPushCheckBox" IsChecked="{Binding allowGitPush, Mode=TwoWay}" HorizontalAlignment="Center" VerticalAlignment="Center" ToolTip="允许任务执行 Git 推送"/>
              </DataTemplate></DataGridTemplateColumn.CellTemplate></DataGridTemplateColumn>
              <DataGridTemplateColumn Header="连接" Width="82"><DataGridTemplateColumn.CellTemplate><DataTemplate>
                <Button x:Name="ToggleProjectButton" Content="{Binding actionText}" Tag="{Binding id}" Margin="2"/>
              </DataTemplate></DataGridTemplateColumn.CellTemplate></DataGridTemplateColumn>
            </DataGrid.Columns>
          </DataGrid>
          <Separator Margin="0,0,0,16"/>
        </StackPanel>

        <CheckBox x:Name="AutoStartCheck" Content="登录 Windows 后自动启动连接器" Margin="0,0,0,16"/>

        <TextBlock Text="任务" FontSize="14" FontWeight="SemiBold" Margin="0,0,0,8"/>
        <DataGrid x:Name="TaskGrid" AutoGenerateColumns="False" IsReadOnly="True" CanUserAddRows="False" RowHeaderWidth="0" HeadersVisibility="Column" GridLinesVisibility="Horizontal" MaxHeight="220" Margin="0,0,0,10" HorizontalScrollBarVisibility="Auto">
          <DataGrid.Columns>
            <DataGridTextColumn Header="项目" Binding="{Binding projectName}" Width="110"/><DataGridTextColumn Header="迭代" Binding="{Binding threadTitle}" Width="120"/><DataGridTextColumn Header="提出人" Binding="{Binding requestedByName}" Width="80"/>
            <DataGridTextColumn Header="接收时间" Binding="{Binding receivedText}" Width="125"/><DataGridTextColumn Header="首开时间" Binding="{Binding firstStartedText}" Width="125"/><DataGridTextColumn Header="最新时间" Binding="{Binding latestText}" Width="125"/>
            <DataGridTemplateColumn Header="目标" Width="180"><DataGridTemplateColumn.CellTemplate><DataTemplate><TextBlock Text="{Binding target}" TextTrimming="CharacterEllipsis" ToolTip="{Binding target}" VerticalAlignment="Center"/></DataTemplate></DataGridTemplateColumn.CellTemplate></DataGridTemplateColumn>
            <DataGridTextColumn Header="状态" Binding="{Binding statusText}" Width="105"/>
            <DataGridTemplateColumn Header="控制" Width="260"><DataGridTemplateColumn.CellTemplate><DataTemplate><StackPanel Orientation="Horizontal">
              <Button x:Name="AbandonTaskButton" Content="放弃" Visibility="{Binding abandonVisibility}" Margin="2"/><Button x:Name="StartTaskButton" Content="立即开始" Visibility="{Binding startVisibility}" Margin="2"/>
              <Button x:Name="PauseTaskButton" Content="暂停" Visibility="{Binding pauseVisibility}" Margin="2"/><Button x:Name="ResumeTaskButton" Content="继续" Visibility="{Binding resumeVisibility}" Margin="2"/>
              <Button x:Name="EndTaskButton" Content="结束" Visibility="{Binding endVisibility}" Margin="2"/><Button x:Name="RetryTaskButton" Content="重试" Visibility="{Binding retryVisibility}" Margin="2"/>
              <Button x:Name="NotifyTaskButton" Content="通知" Visibility="{Binding notifyVisibility}" Margin="2"/>
            </StackPanel></DataTemplate></DataGridTemplateColumn.CellTemplate></DataGridTemplateColumn>
          </DataGrid.Columns>
        </DataGrid>
        <Separator Margin="0,6,0,16"/>
        <DockPanel Margin="0,0,0,8"><TextBlock Text="运行记录" FontSize="14" FontWeight="SemiBold"/><TextBlock x:Name="UpdateText" DockPanel.Dock="Right" HorizontalAlignment="Right" Foreground="#849083"/></DockPanel>
        <TextBox x:Name="LogText" Height="180" IsReadOnly="True" AcceptsReturn="True" TextWrapping="Wrap" VerticalScrollBarVisibility="Auto" Background="#FFFFFF" FontFamily="Consolas" FontSize="11"/>
      </StackPanel>
    </ScrollViewer>
    <Border Grid.Row="2" Background="#FFFFFF" BorderBrush="#E1E6DE" BorderThickness="0,1,0,0" Padding="20,12"><DockPanel><TextBlock Text="关闭窗口后仍会在系统托盘运行" Foreground="#8A9488" VerticalAlignment="Center"/><StackPanel DockPanel.Dock="Right" Orientation="Horizontal" HorizontalAlignment="Right"><Button x:Name="HideButton" Content="隐藏到托盘"/><Button x:Name="ExitButton" Content="退出连接器" Margin="0"/></StackPanel></DockPanel></Border>
  </Grid>
</Window>
'@

$reader = New-Object System.Xml.XmlNodeReader $xaml
$window = [Windows.Markup.XamlReader]::Load($reader)
$window.Icon = [Windows.Media.Imaging.BitmapFrame]::Create([uri]$IconPath)
$bigWindowIcon = New-Object System.Drawing.Icon($IconPath, 32, 32)
$smallWindowIcon = New-Object System.Drawing.Icon($IconPath, 16, 16)
$window.Add_SourceInitialized({
  $handle = (New-Object System.Windows.Interop.WindowInteropHelper($window)).Handle
  [void][CoThreadWindowIcon]::SendMessage($handle, 0x0080, [IntPtr]1, $bigWindowIcon.Handle)
  [void][CoThreadWindowIcon]::SendMessage($handle, 0x0080, [IntPtr]0, $smallWindowIcon.Handle)
})
$names = @('VersionText','StatusDot','StatusText','PairPanel','ServerInput','PairButton','PrerequisitePanel','CheckButton','GitStatusText','GitHintText','CodexStatusText','CodexLoginButton','ProjectPanel','RefreshButton','ProjectGrid','AutoStartCheck','TaskGrid','UpdateText','LogText','HideButton','ExitButton')
foreach ($name in $names) { Set-Variable -Name $name -Value $window.FindName($name) }
$script:allowExit = $false
$script:projectSignature = ''
$script:projectRows = @()
$script:lastLogs = ''
$script:taskSignature = ''

function Send-Command([string]$type, $payload = @{}) {
  $command = @{ id = [guid]::NewGuid().ToString(); type = $type; payload = $payload } | ConvertTo-Json -Depth 5
  $temporary = "$CommandPath.$PID.tmp"
  [IO.File]::WriteAllText($temporary, $command, [Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $temporary -Destination $CommandPath -Force
}

$PairButton.Add_Click({ Send-Command 'authorize' @{ server=$ServerInput.Text } })
$RefreshButton.Add_Click({ Send-Command 'refreshProjects' })
$CheckButton.Add_Click({ Send-Command 'refreshProjects' })
$CodexLoginButton.Add_Click({ Send-Command 'codexLogin' })
$ProjectGrid.AddHandler([System.Windows.Controls.Button]::ClickEvent, [System.Windows.RoutedEventHandler]{
  param($sender,$eventArgs)
  $button = $eventArgs.OriginalSource
  while ($null -ne $button -and $button -isnot [System.Windows.Controls.Button]) {
    $button = [System.Windows.Media.VisualTreeHelper]::GetParent($button)
  }
  if ($null -eq $button) { return }
  $row = $button.DataContext
  if ($null -eq $row) { return }
  if ($button.Name -eq 'BrowseProjectButton') {
    $picker = New-Object System.Windows.Forms.FolderBrowserDialog
    $picker.Description = "为 $($row.name) 选择 Git 仓库根目录"
    if ($row.root) { $picker.SelectedPath = [string]$row.root }
    if ($picker.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $row.root = $picker.SelectedPath; $ProjectGrid.Items.Refresh() }
    $picker.Dispose()
  } elseif ($button.Name -eq 'ToggleProjectButton') {
    if ([bool]$row.bound) { Send-Command 'unbind' @{ projectId=$row.id } }
    else { Send-Command 'bind' @{ projectId=$row.id; root=$row.root; allowGitPush=[bool]$row.allowGitPush } }
  }
})
$ProjectGrid.AddHandler([System.Windows.Controls.Primitives.ButtonBase]::ClickEvent, [System.Windows.RoutedEventHandler]{
  param($sender,$eventArgs)
  $checkBox = $eventArgs.OriginalSource
  while ($null -ne $checkBox -and $checkBox -isnot [System.Windows.Controls.CheckBox]) {
    $checkBox = [System.Windows.Media.VisualTreeHelper]::GetParent($checkBox)
  }
  if ($null -eq $checkBox -or $checkBox.Name -ne 'GitPushCheckBox' -or $null -eq $checkBox.DataContext) { return }
  $row = $checkBox.DataContext
  if ([bool]$row.bound) { Send-Command 'updateProject' @{ projectId=$row.id; allowGitPush=[bool]$checkBox.IsChecked } }
})
$TaskGrid.AddHandler([System.Windows.Controls.Button]::ClickEvent, [System.Windows.RoutedEventHandler]{
  param($sender,$eventArgs)
  $button = $eventArgs.OriginalSource
  while ($null -ne $button -and $button -isnot [System.Windows.Controls.Button]) { $button = [System.Windows.Media.VisualTreeHelper]::GetParent($button) }
  if ($null -eq $button -or $null -eq $button.DataContext) { return }
  $actions = @{ AbandonTaskButton='abandon'; PauseTaskButton='pause'; ResumeTaskButton='resume'; EndTaskButton='end'; RetryTaskButton='retry'; NotifyTaskButton='notify' }
  if ($button.Name -eq 'StartTaskButton') { Send-Command 'startTask' @{ taskId=$button.DataContext.id } }
  elseif ($actions.ContainsKey($button.Name)) { Send-Command 'taskAction' @{ taskId=$button.DataContext.id; action=$actions[$button.Name] } }
})
$AutoStartCheck.Add_Click({ Send-Command 'autoStart' @{ enabled=[bool]$AutoStartCheck.IsChecked } })
$HideButton.Add_Click({ $window.Hide() })
$ExitButton.Add_Click({ $script:allowExit=$true; Send-Command 'quit'; $window.Close() })

$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = New-Object System.Drawing.Icon($IconPath)
$tray.Text = 'CoThread 本地连接器'
$tray.Visible = $true
$menu = New-Object System.Windows.Forms.ContextMenuStrip
$openItem = $menu.Items.Add('打开连接器')
$exitItem = $menu.Items.Add('退出')
$openItem.Add_Click({ $window.Show(); $window.Activate() })
$exitItem.Add_Click({ $script:allowExit=$true; Send-Command 'quit'; $window.Close() })
$tray.ContextMenuStrip = $menu
$tray.Add_DoubleClick({ $window.Show(); $window.Activate() })
$window.Add_Closing({ param($sender,$eventArgs) if (-not $script:allowExit) { $eventArgs.Cancel=$true; $window.Hide() } })

$timer = New-Object Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds(700)
$timer.Add_Tick({
  try { Get-Process -Id $ParentPid -ErrorAction Stop | Out-Null } catch { $script:allowExit=$true; $window.Close(); return }
  if (-not (Test-Path -LiteralPath $StatePath)) { return }
  try { $state = Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return }
  $VersionText.Text = "版本 $($state.version)"
  $StatusText.Text = [string]$state.status
  $StatusDot.Fill = if ($state.online) { '#4D8C58' } elseif ($state.error) { '#B46A58' } else { '#A7ADA5' }
  $PairPanel.Visibility = if ($state.paired) { 'Collapsed' } else { 'Visible' }
  $ProjectPanel.IsEnabled = [bool]$state.paired
  $GitStatusText.Text = if ($state.prerequisites.gitInstalled) { [string]$state.prerequisites.gitVersion } else { '未安装' }
  $GitHintText.Text = if ($state.prerequisites.gitInstalled) { '' } else { '请先安装 Git' }
  $CodexStatusText.Text = if (-not $state.prerequisites.codexInstalled) { '未安装' } elseif (-not $state.prerequisites.codexLoggedIn) { "$($state.prerequisites.codexVersion) · 可使用自定义模型配置" } else { "$($state.prerequisites.codexVersion) · 账号已登录" }
  $CodexLoginButton.Visibility = if ($state.prerequisites.codexInstalled -and -not $state.prerequisites.codexLoggedIn) { 'Visible' } else { 'Collapsed' }
  $ProjectPanel.IsEnabled = [bool]($state.paired -and $state.prerequisites.gitInstalled -and $state.prerequisites.codexInstalled)
  if ($AutoStartCheck.IsChecked -ne [bool]$state.autoStart) { $AutoStartCheck.IsChecked = [bool]$state.autoStart }
  if (-not $ServerInput.Text) { $ServerInput.Text = [string]$state.server }
  $signature = ($state.projects | ConvertTo-Json -Depth 4 -Compress)
  if ($signature -ne $script:projectSignature) {
    $script:projectSignature = $signature
    $script:projectRows = @($state.projects | ForEach-Object {
      $_ | Add-Member -NotePropertyName actionText -NotePropertyValue $(if($_.bound){'关闭'}else{'开启'}) -Force -PassThru
    })
    $ProjectGrid.ItemsSource = $script:projectRows
  }
  $taskSignature = ($state.tasks | ConvertTo-Json -Depth 4 -Compress)
  if ($taskSignature -ne $script:taskSignature) {
    $script:taskSignature = $taskSignature
    $labels = @{ awaiting_approval='待确认'; queued='待开始'; running='执行中'; paused='暂停'; stopped_pending_approval='终止待通过'; failed_pending_notification='失败待通知'; completed_pending_notification='成功待通知'; cancelled='终止'; completed='成功'; failed='失败'; interrupted='终止' }
    $TaskGrid.ItemsSource = @($state.tasks | ForEach-Object {
      $status = [string]$_.status
      $_ | Add-Member -NotePropertyMembers @{
        statusText=$labels[$status]
        receivedText=$(if($_.receivedAt){([datetime]$_.receivedAt).ToLocalTime().ToString('MM-dd HH:mm')}else{'-'})
        firstStartedText=$(if($_.firstStartedAt){([datetime]$_.firstStartedAt).ToLocalTime().ToString('MM-dd HH:mm')}else{'-'})
        latestText=$(if($_.latestAt){([datetime]$_.latestAt).ToLocalTime().ToString('MM-dd HH:mm')}else{'-'})
        abandonVisibility=$(if($status -eq 'queued'){'Visible'}else{'Collapsed'})
        startVisibility=$(if($status -eq 'queued'){'Visible'}else{'Collapsed'})
        pauseVisibility=$(if($status -eq 'running'){'Visible'}else{'Collapsed'})
        resumeVisibility=$(if($status -eq 'paused'){'Visible'}else{'Collapsed'})
        endVisibility=$(if($status -in @('running','paused')){'Visible'}else{'Collapsed'})
        retryVisibility=$(if($status -in @('failed','failed_pending_notification','cancelled','interrupted','stopped_pending_approval')){'Visible'}else{'Collapsed'})
        notifyVisibility=$(if($status -in @('failed_pending_notification','completed_pending_notification','stopped_pending_approval')){'Visible'}else{'Collapsed'})
      } -Force -PassThru
    })
  }
  $UpdateText.Text = [string]$state.updateStatus
  $logs = [string]::Join("`r`n", @($state.logs))
  if ($logs -ne $script:lastLogs) { $script:lastLogs=$logs; $LogText.Text=$logs; $LogText.ScrollToEnd() }
})
$timer.Start()
try { [void]$window.ShowDialog() } finally { $timer.Stop(); $tray.Visible=$false; $tray.Dispose(); $menu.Dispose(); $bigWindowIcon.Dispose(); $smallWindowIcon.Dispose() }
