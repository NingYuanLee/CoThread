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
  Title="CoThread Connector" Width="1180" Height="720" MinWidth="900" MinHeight="600"
  WindowStartupLocation="CenterScreen" Background="#F7F8F5" FontFamily="Microsoft YaHei UI" FontSize="12">
  <Window.Resources>
    <Style TargetType="Button"><Setter Property="MinHeight" Value="32"/><Setter Property="Padding" Value="12,5"/><Setter Property="Margin" Value="0,0,8,0"/><Setter Property="Background" Value="#FFFFFF"/><Setter Property="BorderBrush" Value="#D9E0D5"/><Setter Property="Foreground" Value="#394438"/><Setter Property="Cursor" Value="Hand"/></Style>
    <Style x:Key="RefreshActionButton" TargetType="Button" BasedOn="{StaticResource {x:Type Button}}"><Setter Property="MinWidth" Value="112"/><Setter Property="Background" Value="#EEF5EF"/><Setter Property="BorderBrush" Value="#BFD3C1"/><Setter Property="Foreground" Value="#37653D"/><Setter Property="FontWeight" Value="SemiBold"/><Style.Triggers><Trigger Property="IsMouseOver" Value="True"><Setter Property="Background" Value="#E1EEE3"/><Setter Property="BorderBrush" Value="#94B499"/></Trigger><Trigger Property="IsEnabled" Value="False"><Setter Property="Background" Value="#F2F4F1"/><Setter Property="BorderBrush" Value="#DDE2DB"/><Setter Property="Foreground" Value="#8C958A"/></Trigger></Style.Triggers></Style>
    <Style TargetType="TextBox"><Setter Property="MinHeight" Value="32"/><Setter Property="Padding" Value="8,5"/><Setter Property="BorderBrush" Value="#D9E0D5"/></Style>
    <Style TargetType="ComboBox"><Setter Property="MinHeight" Value="32"/><Setter Property="Padding" Value="6,3"/><Setter Property="BorderBrush" Value="#D9E0D5"/></Style>
    <Style TargetType="DataGrid"><Setter Property="Background" Value="#FFFFFF"/><Setter Property="BorderBrush" Value="#DDE3DA"/><Setter Property="RowBackground" Value="#FFFFFF"/><Setter Property="AlternatingRowBackground" Value="#FAFBF9"/><Setter Property="AlternationCount" Value="2"/><Setter Property="HorizontalGridLinesBrush" Value="#E9EEE7"/><Setter Property="VerticalGridLinesBrush" Value="Transparent"/><Setter Property="RowHeight" Value="44"/><Setter Property="ColumnHeaderHeight" Value="40"/><Setter Property="HeadersVisibility" Value="Column"/><Setter Property="RowHeaderWidth" Value="0"/><Setter Property="GridLinesVisibility" Value="Horizontal"/><Setter Property="SelectionUnit" Value="FullRow"/><Setter Property="CanUserAddRows" Value="False"/><Setter Property="CanUserDeleteRows" Value="False"/><Setter Property="CanUserResizeRows" Value="False"/><Setter Property="CanUserReorderColumns" Value="False"/></Style>
    <Style TargetType="DataGridColumnHeader"><Setter Property="Background" Value="#F3F6F1"/><Setter Property="Foreground" Value="#596458"/><Setter Property="FontWeight" Value="SemiBold"/><Setter Property="Padding" Value="12,0"/><Setter Property="BorderBrush" Value="#DDE3DA"/><Setter Property="BorderThickness" Value="0,0,0,1"/></Style>
    <Style TargetType="DataGridCell"><Setter Property="Padding" Value="10,0"/><Setter Property="BorderThickness" Value="0"/><Setter Property="VerticalContentAlignment" Value="Center"/><Setter Property="FocusVisualStyle" Value="{x:Null}"/></Style>
    <Style TargetType="DataGridRow"><Setter Property="BorderThickness" Value="0"/><Setter Property="Foreground" Value="#3D473C"/><Style.Triggers><Trigger Property="IsMouseOver" Value="True"><Setter Property="Background" Value="#F0F6F0"/></Trigger><Trigger Property="IsSelected" Value="True"><Setter Property="Background" Value="#E5F0E6"/><Setter Property="Foreground" Value="#283E2B"/></Trigger></Style.Triggers></Style>
    <Style TargetType="TabItem"><Setter Property="MinWidth" Value="104"/><Setter Property="Padding" Value="18,9"/><Setter Property="FontWeight" Value="SemiBold"/><Setter Property="Foreground" Value="#657064"/></Style>
  </Window.Resources>
  <Grid>
    <Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="*"/><RowDefinition Height="Auto"/></Grid.RowDefinitions>
    <Border Grid.Row="0" Background="#FFFFFF" BorderBrush="#E1E6DE" BorderThickness="0,0,0,1" Padding="20,16">
      <DockPanel>
        <StackPanel DockPanel.Dock="Left"><TextBlock Text="CoThread 本地连接器" FontSize="18" FontWeight="SemiBold" Foreground="#283329"/><TextBlock x:Name="VersionText" Margin="0,4,0,0" Foreground="#849083"/></StackPanel>
        <StackPanel DockPanel.Dock="Right" Orientation="Horizontal" HorizontalAlignment="Right" VerticalAlignment="Center"><Button x:Name="ReauthorizeButton" Content="切换账号" MinHeight="28" Padding="10,3" Margin="0,0,14,0" Background="#F7F9F6" Foreground="#526451" ToolTip="重新打开网页授权，可切换登录账号"/><Ellipse x:Name="StatusDot" Width="9" Height="9" Fill="#A7ADA5" Margin="0,0,7,0"/><TextBlock x:Name="StatusText" VerticalAlignment="Center" Foreground="#657064"/></StackPanel>
      </DockPanel>
    </Border>
    <Border Grid.Row="1" Background="#FFFFFF" BorderBrush="#E1E6DE" BorderThickness="0,0,0,1" Padding="20,14">
      <StackPanel>
        <StackPanel x:Name="PairPanel">
          <Grid Margin="0,0,0,14"><Grid.ColumnDefinitions><ColumnDefinition Width="90"/><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><TextBlock Text="连接账号" FontWeight="SemiBold" VerticalAlignment="Center"/><TextBox x:Name="ServerInput" Grid.Column="1" Margin="0,0,10,0"/><Button x:Name="PairButton" Grid.Column="2" Content="网页登录并授权" Background="#536F49" Foreground="White" Margin="0"/></Grid>
        </StackPanel>
        <Grid x:Name="PrerequisitePanel"><Grid.ColumnDefinitions><ColumnDefinition Width="90"/><ColumnDefinition Width="Auto"/><ColumnDefinition Width="18"/><ColumnDefinition Width="Auto"/><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions>
          <TextBlock Text="本机环境" FontWeight="SemiBold" VerticalAlignment="Center"/>
          <StackPanel Grid.Column="1" Orientation="Horizontal" VerticalAlignment="Center"><TextBlock Text="Git  " Foreground="#849083"/><TextBlock x:Name="GitStatusText"/><TextBlock x:Name="GitHintText" Foreground="#A45D4A" Margin="6,0,0,0"/><Button x:Name="InstallGitButton" Content="安装 Git" MinHeight="26" Padding="9,3" Margin="8,0,0,0" Background="#EEF4F8" BorderBrush="#C6D9E5" Foreground="#426C84"/></StackPanel>
          <StackPanel Grid.Column="3" Orientation="Horizontal" VerticalAlignment="Center"><TextBlock Text="Codex CLI  " Foreground="#849083"/><TextBlock x:Name="CodexStatusText"/><Button x:Name="InstallCodexButton" Content="安装 Codex" MinHeight="26" Padding="9,3" Margin="8,0,0,0" Background="#EEF4F8" BorderBrush="#C6D9E5" Foreground="#426C84"/></StackPanel>
          <CheckBox x:Name="AutoStartCheck" Grid.Column="5" Content="开机自动启动" VerticalAlignment="Center" Margin="0,0,16,0"/>
          <Button x:Name="CheckButton" Grid.Column="6" Content="重新检测" Margin="0"/>
        </Grid>
      </StackPanel>
    </Border>

    <TabControl Grid.Row="2" Margin="20,16,20,14" Background="#FFFFFF" BorderBrush="#DDE3DA">
      <TabItem Header="项目">
        <Grid x:Name="ProjectPanel" Margin="16"><Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="*"/></Grid.RowDefinitions>
          <Grid Margin="0,0,0,12"><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><StackPanel><TextBlock Text="项目与本地仓库" FontSize="15" FontWeight="SemiBold" Foreground="#303B30"/><TextBlock Text="关联本地 Git 仓库并配置任务推送权限" Margin="0,3,0,0" Foreground="#849083"/></StackPanel><Button x:Name="RefreshButton" Grid.Column="1" Content="↻  刷新项目" Style="{StaticResource RefreshActionButton}" ToolTip="重新从 CoThread 获取项目列表" Margin="0"/></Grid>
          <DataGrid x:Name="ProjectGrid" Grid.Row="1" AutoGenerateColumns="False" IsReadOnly="False">
            <DataGrid.Columns>
              <DataGridTemplateColumn Header="项目" IsReadOnly="True" Width="1.1*"><DataGridTemplateColumn.CellTemplate><DataTemplate><TextBlock Text="{Binding name}" ToolTip="{Binding name}" TextTrimming="CharacterEllipsis" FontWeight="SemiBold" Foreground="#2E4631" VerticalAlignment="Center"/></DataTemplate></DataGridTemplateColumn.CellTemplate></DataGridTemplateColumn>
              <DataGridTemplateColumn Header="本地 Git 仓库" Width="2*"><DataGridTemplateColumn.CellTemplate><DataTemplate>
                <DockPanel><Button x:Name="BrowseProjectButton" Content="浏览..." DockPanel.Dock="Right" Tag="{Binding id}" Margin="6,1,0,1"/><TextBox x:Name="ProjectRootInput" Text="{Binding root, Mode=TwoWay, UpdateSourceTrigger=PropertyChanged}" ToolTip="可直接输入或粘贴 Git 仓库根目录" VerticalContentAlignment="Center" Margin="0,1,0,1"/></DockPanel>
              </DataTemplate></DataGridTemplateColumn.CellTemplate></DataGridTemplateColumn>
              <DataGridTemplateColumn Header="推送" Width="54"><DataGridTemplateColumn.CellTemplate><DataTemplate>
                <CheckBox x:Name="GitPushCheckBox" IsChecked="{Binding allowGitPush, Mode=TwoWay}" HorizontalAlignment="Center" VerticalAlignment="Center" ToolTip="允许任务执行 Git 推送"/>
              </DataTemplate></DataGridTemplateColumn.CellTemplate></DataGridTemplateColumn>
              <DataGridTemplateColumn Header="状态" Width="92"><DataGridTemplateColumn.CellTemplate><DataTemplate>
                <Border Background="{Binding connectionBackground}" CornerRadius="3" Padding="8,4" HorizontalAlignment="Left" VerticalAlignment="Center"><TextBlock Text="{Binding connectionText}" Foreground="{Binding connectionForeground}" FontWeight="SemiBold"/></Border>
              </DataTemplate></DataGridTemplateColumn.CellTemplate></DataGridTemplateColumn>
              <DataGridTemplateColumn Header="操作" Width="108"><DataGridTemplateColumn.CellTemplate><DataTemplate>
                <Button x:Name="ToggleProjectButton" Content="{Binding actionText}" Tag="{Binding id}" Margin="2" Background="{Binding actionBackground}" BorderBrush="{Binding actionBorder}" Foreground="{Binding actionForeground}"/>
              </DataTemplate></DataGridTemplateColumn.CellTemplate></DataGridTemplateColumn>
            </DataGrid.Columns>
          </DataGrid>
        </Grid>
      </TabItem>
      <TabItem Header="任务">
        <Grid Margin="16"><Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="*"/></Grid.RowDefinitions>
        <Grid Margin="0,0,0,12"><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><StackPanel><TextBlock Text="本机任务" FontSize="15" FontWeight="SemiBold" Foreground="#303B30"/><TextBlock Text="查看任务状态并控制本机执行" Margin="0,3,0,0" Foreground="#849083"/></StackPanel><Button x:Name="RefreshTaskButton" Grid.Column="1" Content="↻  刷新任务" Style="{StaticResource RefreshActionButton}" ToolTip="立即获取最新任务和状态" Margin="0"/></Grid>
        <DataGrid x:Name="TaskGrid" Grid.Row="1" AutoGenerateColumns="False" IsReadOnly="True" HorizontalScrollBarVisibility="Auto">
          <DataGrid.Columns>
            <DataGridTemplateColumn Header="项目" Width="120"><DataGridTemplateColumn.CellTemplate><DataTemplate><TextBlock Text="{Binding projectName}" ToolTip="{Binding projectName}" TextTrimming="CharacterEllipsis" FontWeight="SemiBold" Foreground="#2E4631"/></DataTemplate></DataGridTemplateColumn.CellTemplate></DataGridTemplateColumn><DataGridTemplateColumn Header="迭代" Width="140"><DataGridTemplateColumn.CellTemplate><DataTemplate><TextBlock Text="{Binding threadTitle}" ToolTip="{Binding threadTitle}" TextTrimming="CharacterEllipsis"/></DataTemplate></DataGridTemplateColumn.CellTemplate></DataGridTemplateColumn><DataGridTemplateColumn Header="提出人" Width="85"><DataGridTemplateColumn.CellTemplate><DataTemplate><TextBlock Text="{Binding requestedByName}" ToolTip="{Binding requestedByName}" TextTrimming="CharacterEllipsis" Foreground="#657064"/></DataTemplate></DataGridTemplateColumn.CellTemplate></DataGridTemplateColumn>
            <DataGridTextColumn Header="接收时间" Binding="{Binding receivedText}" Width="112" Foreground="#657064"/><DataGridTextColumn Header="首开时间" Binding="{Binding firstStartedText}" Width="112" Foreground="#657064"/><DataGridTextColumn Header="最新时间" Binding="{Binding latestText}" Width="112" Foreground="#657064"/>
            <DataGridTemplateColumn Header="目标" Width="*"><DataGridTemplateColumn.CellTemplate><DataTemplate><Button x:Name="TaskTargetButton" Padding="0" Margin="0" Background="Transparent" BorderThickness="0" HorizontalContentAlignment="Stretch" ToolTip="点击查看完整目标"><TextBlock Text="{Binding target}" TextTrimming="CharacterEllipsis" TextWrapping="NoWrap" VerticalAlignment="Center" Foreground="#486D4B" FontWeight="SemiBold"/></Button></DataTemplate></DataGridTemplateColumn.CellTemplate></DataGridTemplateColumn>
            <DataGridTemplateColumn Header="状态" Width="105"><DataGridTemplateColumn.CellTemplate><DataTemplate>
              <Border Background="{Binding statusBackground}" CornerRadius="3" Padding="8,4" HorizontalAlignment="Left" VerticalAlignment="Center"><TextBlock Text="{Binding statusText}" Foreground="{Binding statusForeground}" FontWeight="SemiBold"/></Border>
            </DataTemplate></DataGridTemplateColumn.CellTemplate></DataGridTemplateColumn>
            <DataGridTemplateColumn Header="控制" Width="260"><DataGridTemplateColumn.CellTemplate><DataTemplate><StackPanel Orientation="Horizontal">
              <Button x:Name="AbandonTaskButton" Content="放弃" Visibility="{Binding abandonVisibility}" Margin="2" Background="#F8F2EF" BorderBrush="#E7CFC6" Foreground="#935743"/><Button x:Name="StartTaskButton" Content="立即开始" Visibility="{Binding startVisibility}" Margin="2" Background="#527A55" BorderBrush="#527A55" Foreground="#FFFFFF"/>
              <Button x:Name="PauseTaskButton" Content="暂停" Visibility="{Binding pauseVisibility}" Margin="2" Background="#FFF6DF" BorderBrush="#E7CE8C" Foreground="#8A681A"/><Button x:Name="ResumeTaskButton" Content="继续" Visibility="{Binding resumeVisibility}" Margin="2" Background="#527A55" BorderBrush="#527A55" Foreground="#FFFFFF"/>
              <Button x:Name="EndTaskButton" Content="结束" Visibility="{Binding endVisibility}" Margin="2" Background="#A85B50" BorderBrush="#A85B50" Foreground="#FFFFFF"/><Button x:Name="RetryTaskButton" Content="重试" Visibility="{Binding retryVisibility}" Margin="2" Background="#EEF4F8" BorderBrush="#C6D9E5" Foreground="#426C84"/>
              <Button x:Name="NotifyTaskButton" Content="通知" Visibility="{Binding notifyVisibility}" Margin="2" Background="#EAF5F2" BorderBrush="#BFDDD5" Foreground="#397466"/>
            </StackPanel></DataTemplate></DataGridTemplateColumn.CellTemplate></DataGridTemplateColumn>
          </DataGrid.Columns>
        </DataGrid>
        </Grid>
      </TabItem>
      <TabItem Header="记录">
        <Grid Margin="16"><Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="*"/></Grid.RowDefinitions>
          <DockPanel Margin="0,0,0,12"><StackPanel><TextBlock Text="运行记录" FontSize="15" FontWeight="SemiBold" Foreground="#303B30"/><TextBlock Text="连接、更新和任务执行日志" Margin="0,3,0,0" Foreground="#849083"/></StackPanel><TextBlock x:Name="UpdateText" DockPanel.Dock="Right" HorizontalAlignment="Right" VerticalAlignment="Center" Foreground="#849083"/></DockPanel>
          <TextBox x:Name="LogText" Grid.Row="1" IsReadOnly="True" AcceptsReturn="True" TextWrapping="Wrap" VerticalScrollBarVisibility="Auto" HorizontalScrollBarVisibility="Disabled" Background="#FBFCFA" BorderBrush="#E1E6DE" FontFamily="Consolas" FontSize="11" Padding="12"/>
        </Grid>
      </TabItem>
    </TabControl>
    <Border Grid.Row="3" Background="#FFFFFF" BorderBrush="#E1E6DE" BorderThickness="0,1,0,0" Padding="20,12"><DockPanel><TextBlock Text="关闭窗口后仍会在系统托盘运行" Foreground="#8A9488" VerticalAlignment="Center"/><StackPanel DockPanel.Dock="Right" Orientation="Horizontal" HorizontalAlignment="Right"><Button x:Name="HideButton" Content="隐藏到托盘"/><Button x:Name="ExitButton" Content="退出连接器" Margin="0"/></StackPanel></DockPanel></Border>
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
$names = @('VersionText','StatusDot','StatusText','ReauthorizeButton','PairPanel','ServerInput','PairButton','PrerequisitePanel','CheckButton','GitStatusText','GitHintText','InstallGitButton','CodexStatusText','InstallCodexButton','ProjectPanel','RefreshButton','ProjectGrid','AutoStartCheck','RefreshTaskButton','TaskGrid','UpdateText','LogText','HideButton','ExitButton')
foreach ($name in $names) { Set-Variable -Name $name -Value $window.FindName($name) }
$script:allowExit = $false
$script:projectSignature = ''
$script:projectRows = @()
$script:lastLogs = ''
$script:taskSignature = ''
$script:authorizationRequested = $false
$script:authorizationStarted = $false
$script:checkingPrerequisites = $false
$script:projectRefreshRequested = $false
$script:taskRefreshRequested = $false
$script:projectRefreshRevision = 0
$script:taskRefreshRevision = 0

function Send-Command([string]$type, $payload = @{}) {
  $command = @{ id = [guid]::NewGuid().ToString(); type = $type; payload = $payload } | ConvertTo-Json -Depth 5
  $temporary = "$CommandPath.$PID.tmp"
  [IO.File]::WriteAllText($temporary, $command, [Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $temporary -Destination $CommandPath -Force
}

$PairButton.Add_Click({
  $script:authorizationRequested = $true
  $script:authorizationStarted = $false
  $PairButton.IsEnabled = $false
  Send-Command 'authorize' @{ server=$ServerInput.Text }
})
$RefreshButton.Add_Click({
  $script:projectRefreshRequested = $true
  $script:projectRefreshBaseline = $script:projectRefreshRevision
  $RefreshButton.IsEnabled = $false
  $RefreshButton.Content = '刷新中...'
  Send-Command 'refreshProjects'
})
$RefreshTaskButton.Add_Click({
  $script:taskRefreshRequested = $true
  $script:taskRefreshBaseline = $script:taskRefreshRevision
  $RefreshTaskButton.IsEnabled = $false
  $RefreshTaskButton.Content = '刷新中...'
  Send-Command 'refreshTasks'
})
$ReauthorizeButton.Add_Click({
  $script:authorizationRequested = $true
  $script:authorizationStarted = $false
  $ReauthorizeButton.IsEnabled = $false
  $ReauthorizeButton.Content = '等待授权...'
  Send-Command 'authorize' @{ server=$ServerInput.Text }
})
$CheckButton.Add_Click({
  $script:checkingPrerequisites = $true
  $CheckButton.IsEnabled = $false
  $CheckButton.Content = '检测中...'
  Send-Command 'checkPrerequisites'
})
$InstallGitButton.Add_Click({ Send-Command 'installPrerequisite' @{ name='git' } })
$InstallCodexButton.Add_Click({ Send-Command 'installPrerequisite' @{ name='codex' } })
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
    $picker = New-Object Microsoft.Win32.OpenFileDialog
    $picker.Title = "为 $($row.name) 选择 Git 仓库根目录"
    $picker.CheckFileExists = $false
    $picker.CheckPathExists = $true
    $picker.ValidateNames = $false
    $picker.FileName = '选择当前文件夹'
    if ($row.root -and [IO.Directory]::Exists([string]$row.root)) { $picker.InitialDirectory = [string]$row.root }
    if ($picker.ShowDialog($window) -eq $true) {
      $selectedPath = [IO.Path]::GetDirectoryName($picker.FileName)
      if ($selectedPath) { $row.root = $selectedPath; $ProjectGrid.Items.Refresh() }
    }
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
  if ($button.Name -eq 'TaskTargetButton') {
    $detail = New-Object System.Windows.Window
    $detail.Title = '任务目标'
    $detail.Owner = $window
    $detail.Width = 680
    $detail.Height = 460
    $detail.MinWidth = 440
    $detail.MinHeight = 300
    $detail.WindowStartupLocation = 'CenterOwner'
    $detail.Background = '#F7F8F5'
    $detail.FontFamily = $window.FontFamily
    $layout = New-Object System.Windows.Controls.Grid
    $layout.Margin = 20
    $layout.RowDefinitions.Add((New-Object System.Windows.Controls.RowDefinition -Property @{ Height='Auto' }))
    $layout.RowDefinitions.Add((New-Object System.Windows.Controls.RowDefinition -Property @{ Height='*' }))
    $layout.RowDefinitions.Add((New-Object System.Windows.Controls.RowDefinition -Property @{ Height='Auto' }))
    $heading = New-Object System.Windows.Controls.TextBlock -Property @{ Text='完整任务目标'; FontSize=16; FontWeight='SemiBold'; Foreground='#303B30'; Margin='0,0,0,12' }
    $target = New-Object System.Windows.Controls.TextBox -Property @{ Text=[string]$button.DataContext.target; IsReadOnly=$true; TextWrapping='Wrap'; AcceptsReturn=$true; VerticalScrollBarVisibility='Auto'; Padding=12; Background='#FFFFFF'; BorderBrush='#DDE3DA' }
    [System.Windows.Controls.Grid]::SetRow($target, 1)
    $close = New-Object System.Windows.Controls.Button -Property @{ Content='关闭'; Width=84; Margin='0,14,0,0'; HorizontalAlignment='Right'; IsDefault=$true; IsCancel=$true }
    [System.Windows.Controls.Grid]::SetRow($close, 2)
    $close.Add_Click({ $detail.Close() })
    [void]$layout.Children.Add($heading); [void]$layout.Children.Add($target); [void]$layout.Children.Add($close)
    $detail.Content = $layout
    [void]$detail.ShowDialog()
    return
  }
  $actions = @{ AbandonTaskButton='abandon'; PauseTaskButton='pause'; ResumeTaskButton='resume'; EndTaskButton='end'; RetryTaskButton='retry'; NotifyTaskButton='notify' }
  if ($button.Name -eq 'StartTaskButton') { Send-Command 'startTask' @{ taskId=$button.DataContext.id } }
  elseif ($actions.ContainsKey($button.Name)) { Send-Command 'taskAction' @{ taskId=$button.DataContext.id; action=$actions[$button.Name] } }
})
$AutoStartCheck.Add_Click({ Send-Command 'autoStart' @{ enabled=[bool]$AutoStartCheck.IsChecked } })
$HideButton.Add_Click({ $window.Hide() })
$ExitButton.Add_Click({ $script:allowExit=$true; Send-Command 'quit'; $window.Close(); $window.Dispatcher.InvokeShutdown() })

$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = New-Object System.Drawing.Icon($IconPath)
$tray.Text = 'CoThread 本地连接器'
$tray.Visible = $true
$menu = New-Object System.Windows.Forms.ContextMenuStrip
$openItem = $menu.Items.Add('打开连接器')
$exitItem = $menu.Items.Add('退出')
$openItem.Add_Click({ $window.Show(); $window.Activate() })
$exitItem.Add_Click({ $script:allowExit=$true; Send-Command 'quit'; $window.Close(); $window.Dispatcher.InvokeShutdown() })
$tray.ContextMenuStrip = $menu
$tray.Add_DoubleClick({ $window.Show(); $window.Activate() })
$window.Add_Closing({ param($sender,$eventArgs) if (-not $script:allowExit) { $eventArgs.Cancel=$true; $window.Hide() } })

$timer = New-Object Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds(700)
$timer.Add_Tick({
  try { Get-Process -Id $ParentPid -ErrorAction Stop | Out-Null } catch { $script:allowExit=$true; $window.Close(); $window.Dispatcher.InvokeShutdown(); return }
  if (-not (Test-Path -LiteralPath $StatePath)) { return }
  try { $state = Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop } catch { return }
  $VersionText.Text = "版本 $($state.version)"
  $StatusText.Text = [string]$state.status
  $newProjectRefreshRevision = [int]$state.projectRefreshRevision
  $newTaskRefreshRevision = [int]$state.taskRefreshRevision
  if ($script:projectRefreshRequested -and $newProjectRefreshRevision -gt $script:projectRefreshBaseline) {
    $script:projectRefreshRequested = $false
    $RefreshButton.IsEnabled = $true
    $RefreshButton.Content = '↻  刷新项目'
  }
  if ($script:taskRefreshRequested -and $newTaskRefreshRevision -gt $script:taskRefreshBaseline) {
    $script:taskRefreshRequested = $false
    $RefreshTaskButton.IsEnabled = $true
    $RefreshTaskButton.Content = '↻  刷新任务'
  }
  $script:projectRefreshRevision = $newProjectRefreshRevision
  $script:taskRefreshRevision = $newTaskRefreshRevision
  if ($script:checkingPrerequisites -and ([string]$state.status.StartsWith('本机环境已重新检测') -or $state.error)) {
    $script:checkingPrerequisites = $false
    $CheckButton.IsEnabled = $true
    $CheckButton.Content = '重新检测'
  }
  if ([bool]$state.authorizing) { $script:authorizationStarted = $true }
  if ($script:authorizationRequested -and (($script:authorizationStarted -and -not [bool]$state.authorizing) -or $state.error)) {
    $script:authorizationRequested = $false
    $script:authorizationStarted = $false
  }
  $PairButton.IsEnabled = -not ($script:authorizationRequested -or [bool]$state.authorizing)
  $ReauthorizeButton.Visibility = if ($state.paired) { 'Visible' } else { 'Collapsed' }
  $ReauthorizeButton.IsEnabled = -not ($script:authorizationRequested -or [bool]$state.authorizing)
  if ($ReauthorizeButton.IsEnabled) { $ReauthorizeButton.Content = '切换账号' }
  $StatusDot.Fill = if ($state.online) { '#4D8C58' } elseif ($state.error) { '#B46A58' } else { '#A7ADA5' }
  $PairPanel.Visibility = if ($state.paired) { 'Collapsed' } else { 'Visible' }
  $ProjectPanel.IsEnabled = [bool]$state.paired
  $GitStatusText.Text = if ($state.prerequisites.gitInstalled) { [string]$state.prerequisites.gitVersion } else { '未安装' }
  $GitHintText.Text = if ($state.prerequisites.gitInstalled) { '' } else { '请先安装 Git' }
  $InstallGitButton.Visibility = if ($state.prerequisites.gitInstalled) { 'Collapsed' } else { 'Visible' }
  $CodexStatusText.Text = if ($state.prerequisites.codexInstalled) { [string]$state.prerequisites.codexVersion } else { '未安装' }
  $InstallCodexButton.Visibility = if ($state.prerequisites.codexInstalled) { 'Collapsed' } else { 'Visible' }
  $ProjectPanel.IsEnabled = [bool]($state.paired -and $state.prerequisites.gitInstalled -and $state.prerequisites.codexInstalled)
  if ($AutoStartCheck.IsChecked -ne [bool]$state.autoStart) { $AutoStartCheck.IsChecked = [bool]$state.autoStart }
  if (-not $ServerInput.Text) { $ServerInput.Text = [string]$state.server }
  $signature = ($state.projects | ConvertTo-Json -Depth 4 -Compress)
  if ($signature -ne $script:projectSignature) {
    $script:projectSignature = $signature
    $script:projectRows = @($state.projects | Where-Object { $null -ne $_ } | ForEach-Object {
      $bound = [bool]$_.bound
      $_ | Add-Member -NotePropertyMembers @{
        connectionText=$(if($bound){'已连接'}else{'未连接'})
        connectionBackground=$(if($bound){'#EAF5EC'}else{'#F0F2EF'})
        connectionForeground=$(if($bound){'#3F7047'}else{'#687168'})
        actionText=$(if($bound){'关闭连接'}else{'开启连接'})
        actionBackground=$(if($bound){'#F8ECE9'}else{'#527A55'})
        actionBorder=$(if($bound){'#E4C5BE'}else{'#527A55'})
        actionForeground=$(if($bound){'#985347'}else{'#FFFFFF'})
      } -Force -PassThru
    })
    $ProjectGrid.ItemsSource = $script:projectRows
  }
  $taskSignature = ($state.tasks | ConvertTo-Json -Depth 4 -Compress)
  if ($taskSignature -ne $script:taskSignature) {
    $script:taskSignature = $taskSignature
    $labels = @{ awaiting_approval='待确认'; queued='待开始'; running='执行中'; paused='暂停'; stopped_pending_approval='终止待通过'; failed_pending_notification='失败待通知'; completed_pending_notification='成功待通知'; cancelled='终止'; completed='成功'; failed='失败'; interrupted='终止' }
    $TaskGrid.ItemsSource = @($state.tasks | Where-Object { $null -ne $_ } | ForEach-Object {
      $status = [string]$_.status
      $statusColors = switch ($status) {
        'queued' { @('#EEF4F8','#426C84') }
        'running' { @('#EAF5EC','#3F7047') }
        'paused' { @('#FFF6DF','#8A681A') }
        'completed' { @('#EAF5EC','#3F7047') }
        'completed_pending_notification' { @('#EAF5F2','#397466') }
        'awaiting_approval' { @('#F1EFF8','#66578A') }
        { $_ -in @('failed','failed_pending_notification','cancelled','interrupted','stopped_pending_approval') } { @('#F8ECE9','#985347') }
        default { @('#F0F2EF','#687168') }
      }
      $_ | Add-Member -NotePropertyMembers @{
        statusText=$labels[$status]
        statusBackground=$statusColors[0]
        statusForeground=$statusColors[1]
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
try { $window.Show(); [System.Windows.Threading.Dispatcher]::Run() } finally {
  $timer.Stop(); $tray.Visible=$false; $tray.Dispose(); $menu.Dispose()
  $bigWindowIcon.Dispose(); $smallWindowIcon.Dispose()
}
