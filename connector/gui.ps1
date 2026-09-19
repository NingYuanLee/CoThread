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
[ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ICoThreadPropertyStore {
  void GetCount(out uint cProps);
  void GetAt(uint iProp, out CoThreadPropertyKey pkey);
  void GetValue(ref CoThreadPropertyKey key, out CoThreadPropVariant pv);
  void SetValue(ref CoThreadPropertyKey key, ref CoThreadPropVariant pv);
  void Commit();
}
[StructLayout(LayoutKind.Sequential, Pack=4)]
struct CoThreadPropertyKey { public Guid fmtid; public uint pid; }
[StructLayout(LayoutKind.Explicit)]
struct CoThreadPropVariant { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr pointerValue; }
public static class CoThreadWindowIcon {
  static readonly Guid AppUserModel = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
  [DllImport("shell32.dll", CharSet=CharSet.Unicode)]
  public static extern int SetCurrentProcessExplicitAppUserModelID(string appId);
  [DllImport("shell32.dll")]
  static extern int SHGetPropertyStoreForWindow(IntPtr hwnd, ref Guid riid, out ICoThreadPropertyStore store);
  [DllImport("user32.dll", CharSet=CharSet.Auto)]
  public static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll", EntryPoint="SetClassLongPtr", CharSet=CharSet.Auto)]
  static extern IntPtr SetClassLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong);
  public static void BindProcess(string appId) { SetCurrentProcessExplicitAppUserModelID(appId); }
  public static void BindWindow(IntPtr hwnd, IntPtr bigIcon, IntPtr smallIcon, string appId, string iconResource, string displayName, string relaunchCommand) {
    try {
      SendMessage(hwnd, 0x0080, (IntPtr)1, bigIcon);
      SendMessage(hwnd, 0x0080, IntPtr.Zero, smallIcon);
      SetClassLongPtr(hwnd, -14, bigIcon);
      SetClassLongPtr(hwnd, -34, smallIcon);
      Guid iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
      ICoThreadPropertyStore store;
      if (SHGetPropertyStoreForWindow(hwnd, ref iid, out store) != 0 || store == null) return;
      SetProp(store, 5, appId);
      if (!string.IsNullOrEmpty(relaunchCommand)) SetProp(store, 2, relaunchCommand);
      if (!string.IsNullOrEmpty(displayName)) SetProp(store, 4, displayName);
      if (!string.IsNullOrEmpty(iconResource)) SetProp(store, 11, iconResource);
      store.Commit();
    } catch {}
  }
  static void SetProp(ICoThreadPropertyStore store, uint pid, string value) {
    CoThreadPropertyKey key = new CoThreadPropertyKey { fmtid = AppUserModel, pid = pid };
    CoThreadPropVariant pv = new CoThreadPropVariant { vt = 31, pointerValue = Marshal.StringToCoTaskMemUni(value) };
    try { store.SetValue(ref key, ref pv); } finally { Marshal.FreeCoTaskMem(pv.pointerValue); }
  }
}
'@
[void][CoThreadWindowIcon]::BindProcess('CoThread.Connector')
$relaunchCommand = ''
try {
  $parentPath = (Get-Process -Id $ParentPid -ErrorAction Stop).Path
  if ($parentPath) { $relaunchCommand = '"' + $parentPath + '"' }
} catch {}

[xml]$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
  xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
  Title="CoThread Connector" Width="1180" Height="720" MinWidth="900" MinHeight="600"
  WindowStartupLocation="CenterScreen" Background="#F7F8F5" FontFamily="Microsoft YaHei UI" FontSize="12">
  <Window.Resources>
    <Style TargetType="Button"><Setter Property="MinHeight" Value="32"/><Setter Property="Padding" Value="12,5"/><Setter Property="Margin" Value="0,0,8,0"/><Setter Property="Background" Value="#FFFFFF"/><Setter Property="BorderBrush" Value="#D9E0D5"/><Setter Property="Foreground" Value="#394438"/><Setter Property="Cursor" Value="Hand"/></Style>
    <Style x:Key="RefreshActionButton" TargetType="Button" BasedOn="{StaticResource {x:Type Button}}"><Setter Property="MinHeight" Value="28"/><Setter Property="MinWidth" Value="96"/><Setter Property="Padding" Value="10,3"/><Setter Property="Background" Value="#EEF5EF"/><Setter Property="BorderBrush" Value="#BFD3C1"/><Setter Property="Foreground" Value="#37653D"/><Setter Property="FontWeight" Value="SemiBold"/><Style.Triggers><Trigger Property="IsMouseOver" Value="True"><Setter Property="Background" Value="#E1EEE3"/><Setter Property="BorderBrush" Value="#94B499"/></Trigger><Trigger Property="IsEnabled" Value="False"><Setter Property="Background" Value="#F2F4F1"/><Setter Property="BorderBrush" Value="#DDE2DB"/><Setter Property="Foreground" Value="#8C958A"/></Trigger></Style.Triggers></Style>
    <Style x:Key="CompactButton" TargetType="Button" BasedOn="{StaticResource {x:Type Button}}"><Setter Property="MinHeight" Value="22"/><Setter Property="Padding" Value="7,1"/><Setter Property="Margin" Value="0,0,4,0"/><Setter Property="FontSize" Value="11"/></Style>
    <Style x:Key="EnvActionButton" TargetType="Button" BasedOn="{StaticResource {x:Type Button}}"><Setter Property="MinHeight" Value="28"/><Setter Property="Height" Value="28"/><Setter Property="MinWidth" Value="108"/><Setter Property="Padding" Value="10,0"/><Setter Property="Margin" Value="0,0,8,0"/><Setter Property="VerticalAlignment" Value="Center"/><Setter Property="Background" Value="#EEF4F8"/><Setter Property="BorderBrush" Value="#C6D9E5"/><Setter Property="Foreground" Value="#426C84"/></Style>
    <Style x:Key="EnvDangerButton" TargetType="Button" BasedOn="{StaticResource EnvActionButton}"><Setter Property="Background" Value="#F8F1EE"/><Setter Property="BorderBrush" Value="#E0C9C1"/><Setter Property="Foreground" Value="#A45D4A"/><Setter Property="Margin" Value="0"/></Style>
    <Style TargetType="TextBox"><Setter Property="MinHeight" Value="32"/><Setter Property="Padding" Value="8,5"/><Setter Property="BorderBrush" Value="#D9E0D5"/></Style>
    <Style x:Key="GridTextBox" TargetType="TextBox" BasedOn="{StaticResource {x:Type TextBox}}"><Setter Property="MinHeight" Value="22"/><Setter Property="Padding" Value="6,1"/><Setter Property="FontSize" Value="11"/></Style>
    <Style TargetType="ComboBox"><Setter Property="MinHeight" Value="32"/><Setter Property="Padding" Value="6,3"/><Setter Property="BorderBrush" Value="#D9E0D5"/></Style>
    <Style TargetType="DataGrid"><Setter Property="Background" Value="#FFFFFF"/><Setter Property="BorderBrush" Value="#DDE3DA"/><Setter Property="RowBackground" Value="#FFFFFF"/><Setter Property="AlternatingRowBackground" Value="#FAFBF9"/><Setter Property="AlternationCount" Value="2"/><Setter Property="HorizontalGridLinesBrush" Value="#E9EEE7"/><Setter Property="VerticalGridLinesBrush" Value="Transparent"/><Setter Property="RowHeight" Value="30"/><Setter Property="ColumnHeaderHeight" Value="28"/><Setter Property="HeadersVisibility" Value="Column"/><Setter Property="RowHeaderWidth" Value="0"/><Setter Property="GridLinesVisibility" Value="Horizontal"/><Setter Property="SelectionUnit" Value="FullRow"/><Setter Property="CanUserAddRows" Value="False"/><Setter Property="CanUserDeleteRows" Value="False"/><Setter Property="CanUserResizeRows" Value="False"/><Setter Property="CanUserReorderColumns" Value="False"/><Setter Property="CanUserResizeColumns" Value="True"/><Setter Property="HorizontalScrollBarVisibility" Value="Auto"/><Setter Property="VerticalScrollBarVisibility" Value="Auto"/></Style>
    <Style TargetType="DataGridColumnHeader"><Setter Property="Background" Value="#F3F6F1"/><Setter Property="Foreground" Value="#596458"/><Setter Property="FontWeight" Value="SemiBold"/><Setter Property="Padding" Value="8,0"/><Setter Property="BorderBrush" Value="#DDE3DA"/><Setter Property="BorderThickness" Value="0,0,0,1"/></Style>
    <Style TargetType="DataGridCell"><Setter Property="Padding" Value="8,0"/><Setter Property="BorderThickness" Value="0"/><Setter Property="VerticalContentAlignment" Value="Center"/><Setter Property="FocusVisualStyle" Value="{x:Null}"/></Style>
    <Style TargetType="DataGridRow"><Setter Property="BorderThickness" Value="0"/><Setter Property="Foreground" Value="#3D473C"/><Style.Triggers><Trigger Property="IsMouseOver" Value="True"><Setter Property="Background" Value="#F0F6F0"/></Trigger><Trigger Property="IsSelected" Value="True"><Setter Property="Background" Value="#E5F0E6"/><Setter Property="Foreground" Value="#283E2B"/></Trigger></Style.Triggers></Style>
    <Style TargetType="TabItem"><Setter Property="MinWidth" Value="88"/><Setter Property="Padding" Value="16,7"/><Setter Property="FontWeight" Value="SemiBold"/><Setter Property="Foreground" Value="#657064"/></Style>
  </Window.Resources>
  <Grid>
    <Grid.RowDefinitions>
      <RowDefinition Height="Auto"/>
      <RowDefinition Height="*" MinHeight="180"/>
      <RowDefinition Height="5"/>
      <RowDefinition Height="148" MinHeight="72"/>
      <RowDefinition Height="Auto"/>
    </Grid.RowDefinitions>
    <Border Grid.Row="0" Background="#FFFFFF" BorderBrush="#E1E6DE" BorderThickness="0,0,0,1" Padding="20,14">
      <StackPanel>
        <StackPanel x:Name="PairPanel">
          <Grid Margin="0,0,0,14"><Grid.ColumnDefinitions><ColumnDefinition Width="90"/><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><TextBlock Text="服务地址" FontWeight="SemiBold" VerticalAlignment="Center"/><TextBox x:Name="ServerInput" Grid.Column="1" Margin="0,0,10,0" ToolTip="共序服务地址，默认为线上地址；本地验证可改为 http://localhost:3100。修改后需重新授权，已绑定项目按新服务重新绑定"/><StackPanel Grid.Column="2" Orientation="Horizontal" VerticalAlignment="Center"><Button x:Name="PairButton" Content="网页登录并授权" Background="#536F49" Foreground="White" Margin="0,0,8,0"/><Button x:Name="ReauthorizeButton" Content="切换账号" MinHeight="28" Padding="10,3" Margin="0" Background="#F7F9F6" Foreground="#526451" ToolTip="重新打开网页授权，可切换登录账号"/></StackPanel></Grid>
        </StackPanel>
        <StackPanel>
          <Grid x:Name="PrerequisitePanel" Margin="0,0,0,10"><Grid.ColumnDefinitions><ColumnDefinition Width="72"/><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions>
            <TextBlock Text="本机环境" FontWeight="SemiBold" VerticalAlignment="Center" ToolTip="Git CLI 用于创建任务 worktree 和计算 Diff，是连接项目、开始任务的必要条件"/>
            <Border Grid.Column="1" Background="#F7FAF6" BorderBrush="#E4EBE1" BorderThickness="1" CornerRadius="4" Padding="10,8" Margin="0,0,12,0">
              <StackPanel>
                <TextBlock Text="Git CLI" FontWeight="SemiBold" Foreground="#657064" ToolTip="检测本机 git 命令，用于任务 worktree 和 Diff"/>
                <StackPanel Orientation="Horizontal" Margin="0,6,0,0">
                  <TextBlock x:Name="GitStatusText" VerticalAlignment="Center" TextTrimming="CharacterEllipsis"/>
                  <TextBlock x:Name="GitHintText" Foreground="#A45D4A" Margin="6,0,0,0" VerticalAlignment="Center"/>
                  <Button x:Name="InstallGitButton" Content="安装 Git CLI" MinHeight="24" Padding="8,2" Margin="8,0,0,0" Background="#EEF4F8" BorderBrush="#C6D9E5" Foreground="#426C84"/>
                </StackPanel>
              </StackPanel>
            </Border>
            <StackPanel Grid.Column="2" Orientation="Horizontal" VerticalAlignment="Center">
              <CheckBox x:Name="AutoStartCheck" Content="开机自动启动" Height="28" Margin="0,0,16,0" VerticalAlignment="Center" VerticalContentAlignment="Center"/>
              <Button x:Name="CheckButton" Content="重新检测" Style="{StaticResource EnvActionButton}" Margin="0"/>
            </StackPanel>
          </Grid>
          <Grid x:Name="AgentPanel"><Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/></Grid.RowDefinitions><Grid.ColumnDefinitions><ColumnDefinition Width="72"/><ColumnDefinition Width="*"/></Grid.ColumnDefinitions>
            <TextBlock Text="本机 Agent" FontWeight="SemiBold" VerticalAlignment="Top" Margin="0,8,8,0" ToolTip="开始或重试任务时从已安装的 TUI 里选一个；未安装不影响连接项目"/>
            <Grid Grid.Column="1">
              <Grid.ColumnDefinitions>
                <ColumnDefinition Width="*"/>
                <ColumnDefinition Width="*"/>
                <ColumnDefinition Width="*"/>
              </Grid.ColumnDefinitions>
              <Border Grid.Column="0" Background="#F7FAF6" BorderBrush="#E4EBE1" BorderThickness="1" CornerRadius="4" Padding="10,8" Margin="0,0,8,0">
                <StackPanel>
                  <TextBlock Text="Cursor TUI" FontWeight="SemiBold" Foreground="#657064" ToolTip="检测 Cursor Agent CLI（agent），不是 Cursor 编辑器"/>
                  <StackPanel Orientation="Horizontal" Margin="0,6,0,0">
                    <TextBlock x:Name="CursorStatusText" VerticalAlignment="Center" TextTrimming="CharacterEllipsis"/>
                    <Button x:Name="InstallCursorButton" Content="安装 Cursor TUI" MinHeight="24" Padding="8,2" Margin="8,0,0,0" Background="#EEF4F8" BorderBrush="#C6D9E5" Foreground="#426C84"/>
                  </StackPanel>
                  <TextBlock x:Name="CursorMcpText" Margin="0,6,0,0" FontSize="11" TextTrimming="CharacterEllipsis"/>
                </StackPanel>
              </Border>
              <Border Grid.Column="1" Background="#F7FAF6" BorderBrush="#E4EBE1" BorderThickness="1" CornerRadius="4" Padding="10,8" Margin="0,0,8,0">
                <StackPanel>
                  <TextBlock Text="Codex TUI" FontWeight="SemiBold" Foreground="#657064" ToolTip="检测本机 codex 命令，不是 ChatGPT 桌面版"/>
                  <StackPanel Orientation="Horizontal" Margin="0,6,0,0">
                    <TextBlock x:Name="CodexStatusText" VerticalAlignment="Center" TextTrimming="CharacterEllipsis"/>
                    <Button x:Name="InstallCodexButton" Content="安装 Codex TUI" MinHeight="24" Padding="8,2" Margin="8,0,0,0" Background="#EEF4F8" BorderBrush="#C6D9E5" Foreground="#426C84"/>
                  </StackPanel>
                  <TextBlock x:Name="CodexMcpText" Margin="0,6,0,0" FontSize="11" TextTrimming="CharacterEllipsis"/>
                </StackPanel>
              </Border>
              <Border Grid.Column="2" Background="#F7FAF6" BorderBrush="#E4EBE1" BorderThickness="1" CornerRadius="4" Padding="10,8">
                <StackPanel>
                  <TextBlock Text="Claude Code TUI" FontWeight="SemiBold" Foreground="#657064" ToolTip="检测本机 claude 命令，不是 Claude 网页或桌面版"/>
                  <StackPanel Orientation="Horizontal" Margin="0,6,0,0">
                    <TextBlock x:Name="ClaudeStatusText" VerticalAlignment="Center" TextTrimming="CharacterEllipsis"/>
                    <Button x:Name="InstallClaudeButton" Content="安装 Claude Code TUI" MinHeight="24" Padding="8,2" Margin="8,0,0,0" Background="#EEF4F8" BorderBrush="#C6D9E5" Foreground="#426C84"/>
                  </StackPanel>
                  <TextBlock x:Name="ClaudeMcpText" Margin="0,6,0,0" FontSize="11" TextTrimming="CharacterEllipsis"/>
                </StackPanel>
              </Border>
            </Grid>
            <StackPanel Grid.Row="1" Grid.Column="1" Orientation="Horizontal" Margin="0,10,0,0">
              <TextBlock Text="开始任务时从已安装的 TUI 中选一个即可。" Foreground="#849083" VerticalAlignment="Center" Margin="0,0,16,0"/>
              <Button x:Name="RefreshMcpButton" Content="检查并更新 MCP 配置" Style="{StaticResource EnvActionButton}" ToolTip="检查账号 MCP 令牌版本，变化时更新本机 Agent 配置"/>
            </StackPanel>
          </Grid>
        </StackPanel>
      </StackPanel>
    </Border>

    <Grid Grid.Row="1" Margin="20,12,20,0">
      <TabControl x:Name="MainTabs" Background="#FFFFFF" BorderBrush="#DDE3DA">
        <TabItem Header="项目">
          <Grid x:Name="ProjectPanel" Margin="12,10,12,12"><Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="*"/></Grid.RowDefinitions>
            <DockPanel Margin="0,0,0,8">
              <CheckBox x:Name="BoundProjectsOnlyCheck" DockPanel.Dock="Right" Content="只看已连接" IsChecked="True" VerticalAlignment="Center" Margin="12,0,0,0" ToolTip="勾选后只显示已开启连接的项目"/>
              <TextBlock Text="先选 Git 仓库，再按需填写仓库内项目路径（留空则与仓库相同）。任务在独立 worktree 中执行，不检查主仓库未提交改动。" Foreground="#849083" TextWrapping="Wrap" VerticalAlignment="Center"/>
            </DockPanel>
            <DataGrid x:Name="ProjectGrid" Grid.Row="1" AutoGenerateColumns="False" IsReadOnly="False">
              <DataGrid.Columns>
                <DataGridTemplateColumn Header="项目" IsReadOnly="True" Width="140" MinWidth="88"><DataGridTemplateColumn.CellTemplate><DataTemplate><TextBlock Text="{Binding name}" ToolTip="{Binding name}" TextTrimming="CharacterEllipsis" FontWeight="SemiBold" Foreground="#2E4631" VerticalAlignment="Center"/></DataTemplate></DataGridTemplateColumn.CellTemplate></DataGridTemplateColumn>
                <DataGridTemplateColumn Header="Git 仓库" Width="260" MinWidth="160"><DataGridTemplateColumn.CellTemplate><DataTemplate>
                  <DockPanel><Button x:Name="BrowseRepoButton" Content="浏览..." Style="{StaticResource CompactButton}" DockPanel.Dock="Right" Tag="{Binding id}" Margin="6,1,0,1"/><TextBox x:Name="ProjectRepoInput" Style="{StaticResource GridTextBox}" Text="{Binding repo, Mode=TwoWay, UpdateSourceTrigger=PropertyChanged}" ToolTip="Git 仓库根目录，可直接输入或粘贴" VerticalContentAlignment="Center" Margin="0,1,0,1"/></DockPanel>
                </DataTemplate></DataGridTemplateColumn.CellTemplate></DataGridTemplateColumn>
                <DataGridTemplateColumn Header="项目路径" Width="220" MinWidth="140"><DataGridTemplateColumn.CellTemplate><DataTemplate>
                  <DockPanel><Button x:Name="BrowsePathButton" Content="浏览..." Style="{StaticResource CompactButton}" DockPanel.Dock="Right" Tag="{Binding id}" Margin="6,1,0,1"/><TextBox x:Name="ProjectPathInput" Style="{StaticResource GridTextBox}" Text="{Binding projectPath, Mode=TwoWay, UpdateSourceTrigger=PropertyChanged}" ToolTip="可选。仓库内子目录，留空则与 Git 仓库相同" VerticalContentAlignment="Center" Margin="0,1,0,1"/></DockPanel>
                </DataTemplate></DataGridTemplateColumn.CellTemplate></DataGridTemplateColumn>
                <DataGridTemplateColumn Header="推送" Width="48" MinWidth="44"><DataGridTemplateColumn.CellTemplate><DataTemplate>
                  <CheckBox x:Name="GitPushCheckBox" IsChecked="{Binding allowGitPush, Mode=TwoWay}" HorizontalAlignment="Center" VerticalAlignment="Center" ToolTip="允许任务执行 Git 推送"/>
                </DataTemplate></DataGridTemplateColumn.CellTemplate></DataGridTemplateColumn>
                <DataGridTemplateColumn Header="状态" Width="76" MinWidth="64"><DataGridTemplateColumn.CellTemplate><DataTemplate>
                  <Border Background="{Binding connectionBackground}" CornerRadius="3" Padding="6,2" HorizontalAlignment="Left" VerticalAlignment="Center"><TextBlock Text="{Binding connectionText}" Foreground="{Binding connectionForeground}" FontWeight="SemiBold"/></Border>
                </DataTemplate></DataGridTemplateColumn.CellTemplate></DataGridTemplateColumn>
                <DataGridTemplateColumn Header="操作" Width="92" MinWidth="80"><DataGridTemplateColumn.CellTemplate><DataTemplate>
                  <Button x:Name="ToggleProjectButton" Content="{Binding actionText}" Style="{StaticResource CompactButton}" Tag="{Binding id}" Margin="0" Background="{Binding actionBackground}" BorderBrush="{Binding actionBorder}" Foreground="{Binding actionForeground}"/>
                </DataTemplate></DataGridTemplateColumn.CellTemplate></DataGridTemplateColumn>
              </DataGrid.Columns>
            </DataGrid>
          </Grid>
        </TabItem>
        <TabItem Header="任务">
          <Grid Margin="12,10,12,12"><Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="*"/></Grid.RowDefinitions>
          <DockPanel Margin="0,0,0,8">
            <CheckBox x:Name="OpenTasksOnlyCheck" DockPanel.Dock="Right" Content="只看未完成" IsChecked="True" VerticalAlignment="Center" Margin="12,0,0,0" ToolTip="勾选后隐藏已成功、失败或终止的任务；仍有未应用工作副本的任务会保留"/>
            <TextBlock Text="「开始」会在独立 Git worktree 中打开本机 Agent 会话，不检查主仓库未提交改动。结案默认只回传 Diff，不会写入主仓库；需要时再勾选「同时应用到主仓库」。" Foreground="#849083" TextWrapping="Wrap" VerticalAlignment="Center"/>
          </DockPanel>
          <DataGrid x:Name="TaskGrid" Grid.Row="1" AutoGenerateColumns="False" IsReadOnly="True">
            <DataGrid.Columns>
              <DataGridTemplateColumn Header="项目" Width="96" MinWidth="72"><DataGridTemplateColumn.CellTemplate><DataTemplate><TextBlock Text="{Binding projectName}" ToolTip="{Binding projectName}" TextTrimming="CharacterEllipsis" FontWeight="SemiBold" Foreground="#2E4631"/></DataTemplate></DataGridTemplateColumn.CellTemplate></DataGridTemplateColumn>
              <DataGridTemplateColumn Header="迭代" Width="110" MinWidth="80"><DataGridTemplateColumn.CellTemplate><DataTemplate><TextBlock Text="{Binding threadTitle}" ToolTip="{Binding threadTitle}" TextTrimming="CharacterEllipsis"/></DataTemplate></DataGridTemplateColumn.CellTemplate></DataGridTemplateColumn>
              <DataGridTemplateColumn Header="提出人" Width="72" MinWidth="56"><DataGridTemplateColumn.CellTemplate><DataTemplate><TextBlock Text="{Binding requestedByName}" ToolTip="{Binding requestedByName}" TextTrimming="CharacterEllipsis" Foreground="#657064"/></DataTemplate></DataGridTemplateColumn.CellTemplate></DataGridTemplateColumn>
              <DataGridTextColumn Header="接收时间" Binding="{Binding receivedText}" Width="96" MinWidth="88" Foreground="#657064"/><DataGridTextColumn Header="首开时间" Binding="{Binding firstStartedText}" Width="96" MinWidth="88" Foreground="#657064"/><DataGridTextColumn Header="最新时间" Binding="{Binding latestText}" Width="96" MinWidth="88" Foreground="#657064"/>
              <DataGridTemplateColumn Header="目标" Width="200" MinWidth="140"><DataGridTemplateColumn.CellTemplate><DataTemplate><Button x:Name="TaskTargetButton" Padding="0" Margin="0" MinHeight="22" Background="Transparent" BorderThickness="0" HorizontalContentAlignment="Stretch" ToolTip="点击查看完整目标"><TextBlock Text="{Binding target}" TextTrimming="CharacterEllipsis" TextWrapping="NoWrap" VerticalAlignment="Center" Foreground="#486D4B" FontWeight="SemiBold"/></Button></DataTemplate></DataGridTemplateColumn.CellTemplate></DataGridTemplateColumn>
              <DataGridTemplateColumn Header="状态" Width="88" MinWidth="72"><DataGridTemplateColumn.CellTemplate><DataTemplate>
                <Border Background="{Binding statusBackground}" CornerRadius="3" Padding="6,2" HorizontalAlignment="Left" VerticalAlignment="Center"><TextBlock Text="{Binding statusText}" Foreground="{Binding statusForeground}" FontWeight="SemiBold"/></Border>
              </DataTemplate></DataGridTemplateColumn.CellTemplate></DataGridTemplateColumn>
              <DataGridTextColumn Header="Agent" Binding="{Binding agentText}" Width="88" MinWidth="72" Foreground="#657064"/>
              <DataGridTemplateColumn Header="控制" Width="340" MinWidth="220"><DataGridTemplateColumn.CellTemplate><DataTemplate><StackPanel Orientation="Horizontal">
                <Button x:Name="AbandonTaskButton" Content="放弃并通知" IsEnabled="{Binding controlsEnabled}" Style="{StaticResource CompactButton}" Visibility="{Binding abandonVisibility}" Background="#F8F2EF" BorderBrush="#E7CFC6" Foreground="#935743"/><Button x:Name="StartTaskButton" Content="开始" IsEnabled="{Binding controlsEnabled}" Style="{StaticResource CompactButton}" Visibility="{Binding startVisibility}" Background="#527A55" BorderBrush="#527A55" Foreground="#FFFFFF" ToolTip="在新窗口打开本机 Agent 会话"/>
                <Button x:Name="ContinueTaskButton" Content="继续" IsEnabled="{Binding controlsEnabled}" Style="{StaticResource CompactButton}" Visibility="{Binding continueVisibility}" Background="#527A55" BorderBrush="#527A55" Foreground="#FFFFFF" ToolTip="续接原会话，保留未提交改动"/>
                <Button x:Name="FinishTaskButton" Content="完成并通知" IsEnabled="{Binding controlsEnabled}" Style="{StaticResource CompactButton}" Visibility="{Binding finishVisibility}" Background="#EAF5F2" BorderBrush="#BFDDD5" Foreground="#397466" ToolTip="按开始时的基线计算 Diff 并通知迭代群聊；默认不写入主仓库"/>
                <Button x:Name="FailTaskButton" Content="失败并通知" IsEnabled="{Binding controlsEnabled}" Style="{StaticResource CompactButton}" Visibility="{Binding failVisibility}" Background="#A85B50" BorderBrush="#A85B50" Foreground="#FFFFFF"/><Button x:Name="RetryTaskButton" Content="重试" IsEnabled="{Binding controlsEnabled}" Style="{StaticResource CompactButton}" Visibility="{Binding retryVisibility}" Background="#EEF4F8" BorderBrush="#C6D9E5" Foreground="#426C84" ToolTip="新建会话重新开始"/>
                <Button x:Name="NotifyTaskButton" Content="通知" IsEnabled="{Binding controlsEnabled}" Style="{StaticResource CompactButton}" Visibility="{Binding notifyVisibility}" Background="#EAF5F2" BorderBrush="#BFDDD5" Foreground="#397466"/>
                <Button x:Name="ApplyTaskButton" Content="应用到主仓库" IsEnabled="{Binding controlsEnabled}" Style="{StaticResource CompactButton}" Visibility="{Binding applyVisibility}" Background="#527A55" BorderBrush="#527A55" Foreground="#FFFFFF" ToolTip="把独立工作副本中的改动写入主仓库"/>
                <Button x:Name="DiscardWorktreeButton" Content="丢弃副本" IsEnabled="{Binding controlsEnabled}" Style="{StaticResource CompactButton}" Visibility="{Binding discardVisibility}" Background="#F8F2EF" BorderBrush="#E7CFC6" Foreground="#935743" ToolTip="删除未写入主仓库的工作副本，无法恢复"/>
              </StackPanel></DataTemplate></DataGridTemplateColumn.CellTemplate></DataGridTemplateColumn>
            </DataGrid.Columns>
          </DataGrid>
          </Grid>
        </TabItem>
      </TabControl>
      <StackPanel Orientation="Horizontal" HorizontalAlignment="Right" VerticalAlignment="Top" Margin="0,4,10,0">
        <Button x:Name="RefreshButton" Content="↻  刷新项目" Style="{StaticResource RefreshActionButton}" ToolTip="重新从 CoThread 获取项目列表" Margin="0,0,0,0"/>
        <Button x:Name="RefreshTaskButton" Content="↻  刷新任务" Style="{StaticResource RefreshActionButton}" ToolTip="立即获取最新任务和状态" Margin="0" Visibility="Collapsed"/>
      </StackPanel>
    </Grid>
    <GridSplitter Grid.Row="2" Height="5" HorizontalAlignment="Stretch" Background="#E1E6DE" BorderBrush="#D5DCD0" BorderThickness="0,1,0,1" ResizeDirection="Rows" ResizeBehavior="PreviousAndNext"/>
    <Border Grid.Row="3" Background="#FFFFFF" BorderBrush="#E1E6DE" BorderThickness="0,0,0,1" Padding="20,8,20,8">
      <DockPanel>
        <DockPanel DockPanel.Dock="Top" Margin="0,0,0,6">
          <TextBlock Text="运行记录" FontWeight="SemiBold" Foreground="#303B30"/>
          <TextBlock Text="连接和任务执行日志" Margin="10,0,0,0" Foreground="#849083" VerticalAlignment="Center"/>
        </DockPanel>
        <TextBox x:Name="LogText" IsReadOnly="True" AcceptsReturn="True" TextWrapping="Wrap" VerticalScrollBarVisibility="Auto" HorizontalScrollBarVisibility="Disabled" Background="#FBFCFA" BorderBrush="#E1E6DE" FontFamily="Consolas" FontSize="11" Padding="10,8"/>
      </DockPanel>
    </Border>
    <Border Grid.Row="4" Background="#FFFFFF" BorderBrush="#E1E6DE" BorderThickness="0,0,0,0" Padding="20,10">
      <StackPanel Orientation="Horizontal" VerticalAlignment="Center" ToolTip="关闭窗口后仍会在系统托盘运行">
        <Ellipse x:Name="StatusDot" Width="9" Height="9" Fill="#A7ADA5" Margin="0,0,8,0" VerticalAlignment="Center"/>
        <TextBlock x:Name="StatusText" VerticalAlignment="Center" TextTrimming="CharacterEllipsis" Foreground="#657064"/>
      </StackPanel>
    </Border>
  </Grid>
</Window>
'@

$reader = New-Object System.Xml.XmlNodeReader $xaml
$window = [Windows.Markup.XamlReader]::Load($reader)
$window.Icon = [Windows.Media.Imaging.BitmapFrame]::Create([uri]$IconPath)
$bigWindowIcon = New-Object System.Drawing.Icon($IconPath, 256, 256)
$smallWindowIcon = New-Object System.Drawing.Icon($IconPath, 16, 16)
$window.Add_SourceInitialized({
  $handle = (New-Object System.Windows.Interop.WindowInteropHelper($window)).EnsureHandle()
  [CoThreadWindowIcon]::BindWindow($handle, $bigWindowIcon.Handle, $smallWindowIcon.Handle, 'CoThread.Connector', ($IconPath + ',0'), 'CoThread Connector', $relaunchCommand)
})
$names = @('StatusDot','StatusText','ReauthorizeButton','PairPanel','ServerInput','PairButton','PrerequisitePanel','CheckButton','GitStatusText','GitHintText','InstallGitButton','CursorStatusText','InstallCursorButton','CodexStatusText','InstallCodexButton','ClaudeStatusText','InstallClaudeButton','CursorMcpText','CodexMcpText','ClaudeMcpText','RefreshMcpButton','ProjectPanel','MainTabs','RefreshButton','ProjectGrid','BoundProjectsOnlyCheck','AutoStartCheck','RefreshTaskButton','TaskGrid','OpenTasksOnlyCheck','LogText')
foreach ($name in $names) { Set-Variable -Name $name -Value $window.FindName($name) }
$script:allowExit = $false
$script:projectSignature = ''
$script:projectRows = @()
$script:taskRows = @()
$script:lastLogs = ''
$script:taskSignature = ''
$script:projectViewSignature = ''
$script:taskViewSignature = ''
$script:pendingTaskActions = @{}
$script:stateStamp = ''
$script:authorizationRequested = $false
$script:authorizationStarted = $false
$script:checkingPrerequisites = $false
$script:projectRefreshRequested = $false
$script:taskRefreshRequested = $false
$script:projectRefreshRevision = 0
$script:taskRefreshRevision = 0
$script:agentOptions = @()
$script:defaultAgent = ''
$script:agentLabels = @{ cursor='Cursor TUI'; codex='Codex TUI'; claude='Claude Code TUI' }
$script:mcpHint = '连接器会为已检测到的 TUI 自动写入共序 MCP 令牌并按到期续期；已打开的会话需新开才生效'

function Set-ControlText($control, $value) {
  $text = [string]$value
  if ($control.Text -ne $text) { $control.Text = $text }
}

function Set-ControlVisible($control, $visible) {
  $target = if ($visible) { [Windows.Visibility]::Visible } else { [Windows.Visibility]::Collapsed }
  if ($control.Visibility -ne $target) { $control.Visibility = $target }
}

function Set-AgentMcpText($block, $installed, $paired, $configured, $entry, $expiresAt) {
  if (-not $installed) {
    Set-ControlText $block ''
    Set-ControlVisible $block $false
    $block.ToolTip = $script:mcpHint
    return
  }
  $expire = if ($expiresAt) { " · 到期 $(([datetime]$expiresAt).ToLocalTime().ToString('MM-dd'))" } else { '' }
  $text = ''
  $color = '#849083'
  $tip = $script:mcpHint
  if (-not $paired) { $text = 'MCP 授权后写入' }
  elseif (-not $configured) { $text = 'MCP 待获取令牌'; $color = '#8A681A' }
  elseif ($entry.ok) { $text = "MCP 已写入$expire"; $color = '#3F7047' }
  elseif ($entry.error) { $text = 'MCP 写入失败'; $color = '#A45D4A'; $tip = [string]$entry.error }
  else { $text = 'MCP 待写入'; $color = '#8A681A' }
  if ($block.Text -eq $text -and $block.Visibility -eq [Windows.Visibility]::Visible) {
    $block.ToolTip = $tip
    return
  }
  Set-ControlVisible $block $true
  Set-ControlText $block $text
  $block.Foreground = $color
  $block.ToolTip = $tip
}

function Show-FilteredProjects {
  $onlyBound = [bool]$BoundProjectsOnlyCheck.IsChecked
  $rows = @($script:projectRows | Where-Object { -not $onlyBound -or [bool]$_.bound })
  $view = "$( [int]$onlyBound )|" + (($rows | ForEach-Object { '{0}|{1}|{2}|{3}|{4}|{5}' -f [string]$_.id, [string]$_.name, [string]$_.repo, [string]$_.projectPath, [int][bool]$_.bound, [int][bool]$_.allowGitPush }) -join ';')
  if ($view -eq $script:projectViewSignature) { return }
  $script:projectViewSignature = $view
  $ProjectGrid.ItemsSource = $rows
}

function Show-FilteredTasks {
  $onlyOpen = [bool]$OpenTasksOnlyCheck.IsChecked
  $done = @('completed','failed','cancelled','interrupted')
  $rows = @($script:taskRows | Where-Object { -not $onlyOpen -or $done -notcontains [string]$_.status -or [bool]$_.hasKeptWorktree })
  $view = "$( [int]$onlyOpen )|" + (($rows | ForEach-Object { '{0}|{1}|{2}|{3}|{4}|{5}|{6}|{7}|{8}|{9}|{10}|{11}|{12}|{13}' -f [string]$_.id, [string]$_.status, [string]$_.statusText, [string]$_.receivedText, [string]$_.firstStartedText, [string]$_.latestText, [string]$_.agentText, [string]$_.continueVisibility, [string]$_.finishVisibility, [string]$_.failVisibility, [string]$_.retryVisibility, [string]$_.notifyVisibility, [string]$_.applyVisibility, [string]$_.target }) -join ';')
  if ($view -eq $script:taskViewSignature) { return }
  $script:taskViewSignature = $view
  $TaskGrid.ItemsSource = $rows
}

function Set-TaskPending($row, [string]$label) {
  $taskId = [string]$row.id
  $script:pendingTaskActions[$taskId] = [pscustomobject]@{ label=$label; observed=$false; startedAt=[DateTime]::UtcNow }
  $script:taskViewSignature = ''
  Show-FilteredTasks
}

function Clear-ObservedTaskActions($operation) {
  $operationTaskId = if ($null -ne $operation) { [string]$operation.taskId } else { '' }
  if ($operationTaskId -and $script:pendingTaskActions.ContainsKey($operationTaskId)) {
    $script:pendingTaskActions[$operationTaskId].observed = $true
  }
  if ($null -eq $operation) {
    foreach ($taskId in @($script:pendingTaskActions.Keys)) {
      $pending = $script:pendingTaskActions[$taskId]
      if ($pending.observed -or ([DateTime]::UtcNow - $pending.startedAt).TotalSeconds -ge 2) { $script:pendingTaskActions.Remove($taskId) }
    }
  }
}

function Send-Command([string]$type, $payload = @{}) {
  $command = @{ id = [guid]::NewGuid().ToString(); type = $type; payload = $payload } | ConvertTo-Json -Depth 5
  $temporary = "$CommandPath.$PID.tmp"
  [IO.File]::WriteAllText($temporary, $command, [Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $temporary -Destination $CommandPath -Force
}

function New-Dialog([string]$title, [int]$width, [int]$height) {
  $dialog = New-Object System.Windows.Window
  $dialog.Title = $title
  $dialog.Owner = $window
  $dialog.Width = $width
  $dialog.Height = $height
  $dialog.MinWidth = 420
  $dialog.MinHeight = 220
  $dialog.WindowStartupLocation = 'CenterOwner'
  $dialog.Background = '#F7F8F5'
  $dialog.FontFamily = $window.FontFamily
  $dialog.ResizeMode = 'CanResizeWithGrip'
  return $dialog
}

function New-DialogButtons($dialog, [string]$okText) {
  $panel = New-Object System.Windows.Controls.StackPanel -Property @{ Orientation='Horizontal'; HorizontalAlignment='Right'; Margin='0,14,0,0' }
  $cancel = New-Object System.Windows.Controls.Button -Property @{ Content='取消'; Width=84; IsCancel=$true }
  $ok = New-Object System.Windows.Controls.Button -Property @{ Content=$okText; MinWidth=110; Margin='0'; IsDefault=$true; Background='#527A55'; BorderBrush='#527A55'; Foreground='#FFFFFF' }
  $ok.Add_Click({ $dialog.DialogResult = $true; $dialog.Close() }.GetNewClosure())
  [void]$panel.Children.Add($cancel); [void]$panel.Children.Add($ok)
  return $panel
}

# 首次开始且检测到多个 Agent 时弹出选择；只有一个直接返回；没有则提示。返回 $null 表示取消。
function Select-AgentKind($row) {
  if ($row.localAgentKind) { return [string]$row.localAgentKind }
  $options = @($script:agentOptions)
  if ($options.Count -eq 0) {
    [void][System.Windows.MessageBox]::Show('未检测到 Cursor TUI / Codex TUI / Claude Code TUI，请先安装其中一个再开始任务。', 'CoThread Connector', 'OK', 'Warning')
    return $null
  }
  if ($options.Count -eq 1) { return [string]$options[0].kind }
  $dialog = New-Dialog '选择本机 Agent' 520 280
  $layout = New-Object System.Windows.Controls.StackPanel -Property @{ Margin=20 }
  $heading = New-Object System.Windows.Controls.TextBlock -Property @{ Text='这个任务用哪个本机 Agent 执行？'; FontSize=16; FontWeight='SemiBold'; Foreground='#303B30'; Margin='0,0,0,6' }
  $hint = New-Object System.Windows.Controls.TextBlock -Property @{ Text='只在首次开始时选择一次；同一任务「继续」时沿用，「重试」会新建会话。'; Foreground='#849083'; TextWrapping='Wrap'; Margin='0,0,0,14' }
  $combo = New-Object System.Windows.Controls.ComboBox
  $combo.DisplayMemberPath = 'text'
  $combo.SelectedValuePath = 'kind'
  foreach ($option in $options) { [void]$combo.Items.Add([pscustomobject]@{ kind=[string]$option.kind; text="$($option.label)  $($option.version)" }) }
  $combo.SelectedIndex = 0
  if ($script:defaultAgent) { for ($i = 0; $i -lt $combo.Items.Count; $i++) { if ($combo.Items[$i].kind -eq $script:defaultAgent) { $combo.SelectedIndex = $i } } }
  [void]$layout.Children.Add($heading); [void]$layout.Children.Add($hint); [void]$layout.Children.Add($combo)
  [void]$layout.Children.Add((New-DialogButtons $dialog '开始'))
  $dialog.Content = $layout
  if ($dialog.ShowDialog() -eq $true -and $null -ne $combo.SelectedValue) { return [string]$combo.SelectedValue }
  return $null
}

# 结案/失败说明输入框。返回 $null 表示取消；未提供勾选文案时返回字符串，提供时返回 @{ Text; Checked }。
function Show-TextDialog([string]$title, [string]$heading, [string]$hint, [string]$okText, [string]$watermark, [string]$checkboxText = '') {
  $dialog = New-Dialog $title 620 $(if ($checkboxText) { 430 } else { 380 })
  $layout = New-Object System.Windows.Controls.Grid -Property @{ Margin=20 }
  $layout.RowDefinitions.Add((New-Object System.Windows.Controls.RowDefinition -Property @{ Height='Auto' }))
  $layout.RowDefinitions.Add((New-Object System.Windows.Controls.RowDefinition -Property @{ Height='Auto' }))
  $layout.RowDefinitions.Add((New-Object System.Windows.Controls.RowDefinition -Property @{ Height='*' }))
  if ($checkboxText) { $layout.RowDefinitions.Add((New-Object System.Windows.Controls.RowDefinition -Property @{ Height='Auto' })) }
  $layout.RowDefinitions.Add((New-Object System.Windows.Controls.RowDefinition -Property @{ Height='Auto' }))
  $head = New-Object System.Windows.Controls.TextBlock -Property @{ Text=$heading; FontSize=16; FontWeight='SemiBold'; Foreground='#303B30'; Margin='0,0,0,6' }
  $tip = New-Object System.Windows.Controls.TextBlock -Property @{ Text=$hint; Foreground='#849083'; TextWrapping='Wrap'; Margin='0,0,0,12' }
  [System.Windows.Controls.Grid]::SetRow($tip, 1)
  $input = New-Object System.Windows.Controls.TextBox -Property @{ AcceptsReturn=$true; TextWrapping='Wrap'; VerticalScrollBarVisibility='Auto'; Padding=10; Background='#FFFFFF'; BorderBrush='#DDE3DA'; ToolTip=$watermark; MinHeight=120 }
  [System.Windows.Controls.Grid]::SetRow($input, 2)
  $check = $null
  $buttonRow = 3
  if ($checkboxText) {
    $check = New-Object System.Windows.Controls.CheckBox -Property @{ Content=$checkboxText; Margin='0,10,0,0'; IsChecked=$false; VerticalAlignment='Center' }
    [System.Windows.Controls.Grid]::SetRow($check, 3)
    $buttonRow = 4
  }
  $buttons = New-DialogButtons $dialog $okText
  [System.Windows.Controls.Grid]::SetRow($buttons, $buttonRow)
  [void]$layout.Children.Add($head); [void]$layout.Children.Add($tip); [void]$layout.Children.Add($input)
  if ($check) { [void]$layout.Children.Add($check) }
  [void]$layout.Children.Add($buttons)
  $dialog.Content = $layout
  $input.Focus() | Out-Null
  if ($dialog.ShowDialog() -ne $true) { return $null }
  if ($checkboxText) { return @{ Text = [string]$input.Text; Checked = [bool]$check.IsChecked } }
  return [string]$input.Text
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
function Sync-RefreshButtons {
  $onProjects = $MainTabs.SelectedIndex -ne 1
  $RefreshButton.Visibility = if ($onProjects) { 'Visible' } else { 'Collapsed' }
  $RefreshTaskButton.Visibility = if ($onProjects) { 'Collapsed' } else { 'Visible' }
}
$MainTabs.Add_SelectionChanged({ Sync-RefreshButtons })
Sync-RefreshButtons
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
$InstallCursorButton.Add_Click({ Send-Command 'installPrerequisite' @{ name='cursor' } })
$InstallCodexButton.Add_Click({ Send-Command 'installPrerequisite' @{ name='codex' } })
$InstallClaudeButton.Add_Click({ Send-Command 'installPrerequisite' @{ name='claude' } })
$RefreshMcpButton.Add_Click({ Send-Command 'refreshMcp' })
$ProjectGrid.AddHandler([System.Windows.Controls.Button]::ClickEvent, [System.Windows.RoutedEventHandler]{
  param($sender,$eventArgs)
  $button = $eventArgs.OriginalSource
  while ($null -ne $button -and $button -isnot [System.Windows.Controls.Button]) {
    $button = [System.Windows.Media.VisualTreeHelper]::GetParent($button)
  }
  if ($null -eq $button) { return }
  $row = $button.DataContext
  if ($null -eq $row) { return }
  if ($button.Name -eq 'BrowseRepoButton' -or $button.Name -eq 'BrowsePathButton') {
    $picker = New-Object Microsoft.Win32.OpenFileDialog
    $isRepo = $button.Name -eq 'BrowseRepoButton'
    $picker.Title = if ($isRepo) { "为 $($row.name) 选择 Git 仓库根目录" } else { "为 $($row.name) 选择项目路径（仓库内子目录，可与仓库相同）" }
    $picker.CheckFileExists = $false
    $picker.CheckPathExists = $true
    $picker.ValidateNames = $false
    $picker.FileName = '选择当前文件夹'
    $startDir = if ($isRepo) { [string]$row.repo } else { if ($row.projectPath -and [IO.Path]::IsPathRooted([string]$row.projectPath)) { [string]$row.projectPath } elseif ($row.repo -and $row.projectPath) { [IO.Path]::Combine([string]$row.repo, [string]$row.projectPath) } else { [string]$row.repo } }
    if ($startDir -and [IO.Directory]::Exists($startDir)) { $picker.InitialDirectory = $startDir }
    if ($picker.ShowDialog($window) -eq $true) {
      $selectedPath = [IO.Path]::GetDirectoryName($picker.FileName)
      if ($selectedPath) {
        if ($isRepo) { $row.repo = $selectedPath }
        else { $row.projectPath = $selectedPath }
        $ProjectGrid.Items.Refresh()
      }
    }
  } elseif ($button.Name -eq 'ToggleProjectButton') {
    if ([bool]$row.bound) { Send-Command 'unbind' @{ projectId=$row.id } }
    else { Send-Command 'bind' @{ projectId=$row.id; repo=$row.repo; projectPath=$row.projectPath; allowGitPush=[bool]$row.allowGitPush } }
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
  $row = $button.DataContext
  $actions = @{ AbandonTaskButton='abandon'; NotifyTaskButton='notify' }
  if ($button.Name -eq 'StartTaskButton') {
    $kind = Select-AgentKind $row
    if ($null -ne $kind) { Set-TaskPending $row '处理中…'; Send-Command 'startTask' @{ taskId=$row.id; agentKind=$kind } }
  } elseif ($button.Name -eq 'ContinueTaskButton') {
    $kind = Select-AgentKind $row
    if ($null -ne $kind) { Set-TaskPending $row '处理中…'; Send-Command 'startTask' @{ taskId=$row.id; agentKind=$kind } }
  } elseif ($button.Name -eq 'RetryTaskButton') {
    $kind = Select-AgentKind ([pscustomobject]@{ localAgentKind='' })
    if ($null -ne $kind) { Set-TaskPending $row '处理中…'; Send-Command 'startTask' @{ taskId=$row.id; agentKind=$kind; retry=$true } }
  } elseif ($button.Name -eq 'FinishTaskButton') {
    $result = Show-TextDialog '完成并通知' '确认结案并通知迭代群聊' '改动目前只在独立工作副本中，默认不会写入你的主仓库。连接器会按开始时的 Git 基线计算 Diff 回传到迭代群聊；摘要可选，留空则使用默认结案说明。' '完成并通知' '例如：已完成登录页样式调整，未改接口。' '同时应用到主仓库'
    if ($null -ne $result) { Set-TaskPending $row '处理中…'; Send-Command 'finishTask' @{ taskId=$row.id; summary=[string]$result.Text; applyToMain=[bool]$result.Checked } }
  } elseif ($button.Name -eq 'FailTaskButton') {
    $reason = Show-TextDialog '标记失败' '将此任务标记为失败' '任务会以失败状态回到迭代群聊，本机会话记录随之清理；可填写原因，留空则记为「本机执行未完成」。' '标记失败' '例如：需求与现有实现冲突，需要提出人确认。'
    if ($null -ne $reason) { Set-TaskPending $row '处理中…'; Send-Command 'failTask' @{ taskId=$row.id; reason=$reason } }
  } elseif ($button.Name -eq 'ApplyTaskButton') {
    Set-TaskPending $row '处理中…'; Send-Command 'applyTask' @{ taskId=$row.id }
  } elseif ($button.Name -eq 'DiscardWorktreeButton') {
    $answer = [System.Windows.MessageBox]::Show("丢弃后独立工作副本无法恢复，主仓库也不会写入这些改动。`n`n确定丢弃？", 'CoThread Connector', 'YesNo', 'Warning')
    if ($answer -eq 'Yes') { Set-TaskPending $row '处理中…'; Send-Command 'discardWorktree' @{ taskId=$row.id } }
  } elseif ($actions.ContainsKey($button.Name)) { Set-TaskPending $row '处理中…'; Send-Command 'taskAction' @{ taskId=$row.id; action=$actions[$button.Name] } }
})
$AutoStartCheck.Add_Click({ Send-Command 'autoStart' @{ enabled=[bool]$AutoStartCheck.IsChecked } })
$BoundProjectsOnlyCheck.Add_Click({ Show-FilteredProjects })
$OpenTasksOnlyCheck.Add_Click({ Show-FilteredTasks })

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
  try {
    $info = Get-Item -LiteralPath $StatePath
    $stamp = '{0}|{1}' -f $info.LastWriteTimeUtc.Ticks, $info.Length
    if ($stamp -eq $script:stateStamp) { return }
    $state = Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
    $script:stateStamp = $stamp
  } catch { return }
  $title = "CoThread Connector $($state.version)"
  if ($window.Title -ne $title) { $window.Title = $title }
  Clear-ObservedTaskActions $state.operation
  Set-ControlText $StatusText $(if ($state.operation) { [string]$state.operation.label } else { [string]$state.status })
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
  $pairText = if ($state.paired) { '切换服务并重新授权' } else { '网页登录并授权' }
  if ($PairButton.Content -ne $pairText) { $PairButton.Content = $pairText }
  Set-ControlVisible $ReauthorizeButton ([bool]$state.paired)
  $ReauthorizeButton.IsEnabled = -not ($script:authorizationRequested -or [bool]$state.authorizing)
  if ($ReauthorizeButton.IsEnabled -and $ReauthorizeButton.Content -ne '切换账号') { $ReauthorizeButton.Content = '切换账号' }
  $dot = if ($state.online) { '#4D8C58' } elseif ($state.error) { '#B46A58' } else { '#A7ADA5' }
  if ([string]$StatusDot.Fill -ne $dot) { $StatusDot.Fill = $dot }
  Set-ControlText $GitStatusText $(if ($state.prerequisites.gitInstalled) { [string]$state.prerequisites.gitVersion } else { '未安装' })
  Set-ControlText $GitHintText $(if ($state.prerequisites.gitInstalled) { '' } else { '请先安装 Git CLI' })
  Set-ControlVisible $InstallGitButton (-not [bool]$state.prerequisites.gitInstalled)
  $agents = $state.prerequisites.agents
  Set-ControlText $CursorStatusText $(if ($agents.cursor.installed) { [string]$agents.cursor.version } else { '未安装' })
  Set-ControlVisible $InstallCursorButton (-not [bool]$agents.cursor.installed)
  Set-ControlText $CodexStatusText $(if ($agents.codex.installed) { [string]$agents.codex.version } else { '未安装' })
  Set-ControlVisible $InstallCodexButton (-not [bool]$agents.codex.installed)
  Set-ControlText $ClaudeStatusText $(if ($agents.claude.installed) { [string]$agents.claude.version } else { '未安装' })
  Set-ControlVisible $InstallClaudeButton (-not [bool]$agents.claude.installed)
  $script:agentOptions = @(foreach ($kind in @('cursor','codex','claude')) { if ($agents.$kind.installed) { [pscustomobject]@{ kind=$kind; label=$script:agentLabels[$kind]; version=[string]$agents.$kind.version } } })
  $script:defaultAgent = [string]$state.defaultAgent
  $anyAgent = $script:agentOptions.Count -gt 0
  Set-AgentMcpText $CursorMcpText ([bool]$agents.cursor.installed) ([bool]$state.paired) ([bool]$state.mcp.configured) $state.mcp.agents.cursor $state.mcp.expiresAt
  Set-AgentMcpText $CodexMcpText ([bool]$agents.codex.installed) ([bool]$state.paired) ([bool]$state.mcp.configured) $state.mcp.agents.codex $state.mcp.expiresAt
  Set-AgentMcpText $ClaudeMcpText ([bool]$agents.claude.installed) ([bool]$state.paired) ([bool]$state.mcp.configured) $state.mcp.agents.claude $state.mcp.expiresAt
  Set-ControlVisible $RefreshMcpButton ([bool]($state.paired -and $anyAgent))
  $ProjectPanel.IsEnabled = [bool]($state.paired -and $state.prerequisites.gitInstalled)
  if ($AutoStartCheck.IsChecked -ne [bool]$state.autoStart) { $AutoStartCheck.IsChecked = [bool]$state.autoStart }
  if (-not $ServerInput.Text) { $ServerInput.Text = [string]$state.server }
  $signature = (@($state.projects) | Where-Object { $null -ne $_ } | ForEach-Object { '{0}|{1}|{2}|{3}|{4}|{5}' -f [string]$_.id, [string]$_.name, [string]$_.repo, [string]$_.projectPath, [int][bool]$_.bound, [int][bool]$_.allowGitPush }) -join "`n"
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
    Show-FilteredProjects
  }
  $taskSignature = (@($state.tasks) | Where-Object { $null -ne $_ } | ForEach-Object {
    $latest = if ($_.latestAt) { ([datetime]$_.latestAt).ToLocalTime().ToString('MM-dd HH:mm') } else { '' }
    $pending = if ($script:pendingTaskActions.ContainsKey([string]$_.id)) { $script:pendingTaskActions[[string]$_.id] } else { $null }
    '{0}|{1}|{2}|{3}|{4}|{5}|{6}|{7}|{8}|{9}|{10}' -f [string]$_.id, [string]$_.status, [string]$_.target, [string]$_.projectName, [string]$_.threadTitle, [string]$_.requestedByName, [string]$_.localAgentKind, [int][bool]$_.windowOpen, [int][bool]$_.hasLocalRecord, $latest, [string]$pending.label
  }) -join "`n"
  if ($taskSignature -ne $script:taskSignature) {
    $script:taskSignature = $taskSignature
    $labels = @{ awaiting_approval='待确认'; queued='待开始'; running='会话进行中'; paused='会话已关闭'; stopped_pending_approval='终止待通过'; failed_pending_notification='失败待通知'; completed_pending_notification='成功待通知'; cancelled='终止'; completed='成功'; failed='失败'; interrupted='终止' }
    $script:taskRows = @($state.tasks | Where-Object { $null -ne $_ } | ForEach-Object {
      $status = [string]$_.status
      $pending = if ($script:pendingTaskActions.ContainsKey([string]$_.id)) { $script:pendingTaskActions[[string]$_.id] } else { $null }
      $statusColors = if ($pending) { @('#FFF6DF','#8A681A') } else { switch ($status) {
        'queued' { @('#EEF4F8','#426C84') }
        'running' { @('#EAF5EC','#3F7047') }
        'paused' { @('#FFF6DF','#8A681A') }
        'completed' { @('#EAF5EC','#3F7047') }
        'completed_pending_notification' { @('#EAF5F2','#397466') }
        'awaiting_approval' { @('#F1EFF8','#66578A') }
        { $_ -in @('failed','failed_pending_notification','cancelled','interrupted','stopped_pending_approval') } { @('#F8ECE9','#985347') }
        default { @('#F0F2EF','#687168') }
      } }
      $_ | Add-Member -NotePropertyMembers @{
        statusText=$(if($pending){[string]$pending.label}else{$labels[$status]})
        statusBackground=$statusColors[0]
        statusForeground=$statusColors[1]
        receivedText=$(if($_.receivedAt){([datetime]$_.receivedAt).ToLocalTime().ToString('MM-dd HH:mm')}else{'-'})
        firstStartedText=$(if($_.firstStartedAt){([datetime]$_.firstStartedAt).ToLocalTime().ToString('MM-dd HH:mm')}else{'-'})
        latestText=$(if($_.latestAt){([datetime]$_.latestAt).ToLocalTime().ToString('MM-dd HH:mm')}else{'-'})
        agentText=$(if($_.localAgentKind -and $script:agentLabels.ContainsKey([string]$_.localAgentKind)){$script:agentLabels[[string]$_.localAgentKind]}elseif($_.localAgentKind){[string]$_.localAgentKind}else{'-'})
        abandonVisibility=$(if($status -eq 'queued'){'Visible'}else{'Collapsed'})
        startVisibility=$(if($status -eq 'queued'){'Visible'}else{'Collapsed'})
        continueVisibility=$(if($status -eq 'paused' -and -not [bool]$_.windowOpen){'Visible'}else{'Collapsed'})
        finishVisibility=$(if($status -in @('running','paused') -and [bool]$_.hasLocalRecord){'Visible'}else{'Collapsed'})
        failVisibility=$(if($status -in @('running','paused') -and [bool]$_.hasLocalRecord){'Visible'}else{'Collapsed'})
        retryVisibility=$(if($status -in @('failed','failed_pending_notification','cancelled','interrupted','stopped_pending_approval')){'Visible'}else{'Collapsed'})
        notifyVisibility=$(if($status -in @('failed_pending_notification','completed_pending_notification','stopped_pending_approval')){'Visible'}else{'Collapsed'})
        applyVisibility=$(if([bool]$_.hasKeptWorktree){'Visible'}else{'Collapsed'})
        discardVisibility=$(if([bool]$_.hasKeptWorktree){'Visible'}else{'Collapsed'})
        controlsEnabled=($null -eq $pending)
      } -Force -PassThru
    })
    Show-FilteredTasks
  }
  $logs = [string]::Join("`r`n", @($state.logs))
  if ($logs -ne $script:lastLogs) {
    $offset = $LogText.VerticalOffset
    $script:lastLogs = $logs
    $LogText.Text = $logs
    $LogText.UpdateLayout()
    $max = [Math]::Max(0.0, $LogText.ExtentHeight - $LogText.ViewportHeight)
    $LogText.ScrollToVerticalOffset([Math]::Min($offset, $max))
  }
})
$timer.Start()
try { $window.Show(); [System.Windows.Threading.Dispatcher]::Run() } finally {
  $timer.Stop(); $tray.Visible=$false; $tray.Dispose(); $menu.Dispose()
  $bigWindowIcon.Dispose(); $smallWindowIcon.Dispose()
}
